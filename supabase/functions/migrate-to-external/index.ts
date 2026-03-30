import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * migrate-to-external
 *
 * Migrates data from the internal Supabase to the external one in batches.
 *
 * POST body:
 *   table:     "whatsapp_messages" | "leads" | "campaign_recipients"
 *   batchSize: number (default 1000)
 *   cursor:    string | null  (created_at cursor for resume)
 *   dryRun:    boolean (default false – just count without inserting)
 *
 * Returns:
 *   { migrated, lastCursor, hasMore, errors }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check (super_admin only) ─────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const internalUrl = Deno.env.get("SUPABASE_URL")!;
    const internalAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const internalServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller
    const authClient = createClient(internalUrl, internalAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Check super_admin
    const svcClient = createClient(internalUrl, internalServiceKey);
    const { data: roleData } = await svcClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return json({ error: "Forbidden – super_admin required" }, 403);
    }

    // ── External DB client ────────────────────────────────────────
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return json({ error: "External DB not configured" }, 500);
    }
    const extClient = createClient(extUrl, extKey);

    // ── Parse body ────────────────────────────────────────────────
    const body = await req.json();
    const table: string = body.table;
    const batchSize: number = Math.min(body.batchSize ?? 1000, 2000);
    const cursor: string | null = body.cursor ?? null;
    const dryRun: boolean = body.dryRun ?? false;

    const allowedTables = [
      "whatsapp_messages",
      "leads",
      "campaign_recipients",
    ];
    if (!allowedTables.includes(table)) {
      return json(
        { error: `Invalid table. Allowed: ${allowedTables.join(", ")}` },
        400
      );
    }

    // ── Read batch from internal DB ───────────────────────────────
    let query = svcClient
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (cursor) {
      query = query.gt("created_at", cursor);
    }

    const { data: rows, error: readError } = await query;

    if (readError) {
      return json({ error: `Read error: ${readError.message}` }, 500);
    }

    if (!rows || rows.length === 0) {
      return json({
        migrated: 0,
        lastCursor: cursor,
        hasMore: false,
        errors: [],
        message: "No more rows to migrate",
      });
    }

    const lastCursor = rows[rows.length - 1].created_at;
    const hasMore = rows.length === batchSize;

    if (dryRun) {
      return json({
        migrated: 0,
        readCount: rows.length,
        lastCursor,
        hasMore,
        dryRun: true,
        message: `Would migrate ${rows.length} rows from ${table}`,
      });
    }

    // ── Write in sub-batches to external DB ───────────────────────
    // Supabase insert has practical limits, so we chunk at 500
    const SUB_BATCH = 500;
    let migrated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i += SUB_BATCH) {
      const chunk = rows.slice(i, i + SUB_BATCH);

      const { error: insertError, count } = await extClient
        .from(table)
        .upsert(chunk, {
          onConflict: "id",
          ignoreDuplicates: true,
        });

      if (insertError) {
        errors.push(
          `Batch ${Math.floor(i / SUB_BATCH)}: ${insertError.message}`
        );
      } else {
        migrated += chunk.length;
      }
    }

    return json({
      migrated,
      lastCursor,
      hasMore,
      errors,
      message: `Migrated ${migrated}/${rows.length} rows from ${table}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[migrate-to-external]", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
