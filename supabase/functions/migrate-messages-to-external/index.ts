import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * migrate-messages-to-external
 *
 * Moves whatsapp_messages from internal DB to external DB,
 * converting channel_id from UUID to the client's phone number.
 *
 * For inbound messages: channel_id = sender_phone
 * For outbound messages: channel_id = metadata.destination
 *
 * Requires super_admin role.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
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

    // External DB client
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return json({ error: "External DB not configured" }, 500);
    }
    const extClient = createClient(extUrl, extKey);

    // Parse request body
    const body = await req.json();
    const batchSize = body.batchSize || 500;
    const cursor = body.cursor || null; // ISO timestamp for pagination

    // Fetch messages from internal DB
    let query = svcClient
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (cursor) {
      query = query.gt("created_at", cursor);
    }

    const { data: messages, error: fetchError } = await query;

    if (fetchError) {
      return json({ error: `Fetch error: ${fetchError.message}` }, 500);
    }

    if (!messages || messages.length === 0) {
      return json({ success: true, migrated: 0, done: true, message: "No more messages to migrate" });
    }

    // Transform messages: convert channel_id from UUID to client phone
    let skipped = 0;
    const transformed = messages.map((msg: Record<string, unknown>) => {
      let clientPhone: string | null = null;

      if (msg.direction === "inbound") {
        clientPhone = (msg.sender_phone as string)?.replace(/\D/g, "") || null;
      } else {
        // Outbound: get destination from metadata
        const metadata = msg.metadata as Record<string, unknown> | null;
        const dest = (metadata?.destination as string) || (metadata?.to as string) || (metadata?.phone as string);
        clientPhone = dest?.replace(/\D/g, "") || null;
      }

      if (!clientPhone) {
        skipped++;
        return null;
      }

      return {
        ...msg,
        channel_id: clientPhone,
      };
    }).filter(Boolean);

    if (transformed.length === 0) {
      const lastCursor = messages[messages.length - 1]?.created_at;
      return json({
        success: true,
        migrated: 0,
        skipped,
        done: messages.length < batchSize,
        nextCursor: lastCursor || null,
      });
    }

    // Insert into external DB (upsert to avoid duplicates)
    const { error: insertError, count } = await extClient
      .from("whatsapp_messages")
      .upsert(transformed, { onConflict: "message_id", ignoreDuplicates: true });

    if (insertError) {
      return json({ error: `Insert error: ${insertError.message}`, migrated: 0 }, 500);
    }

    const lastCursor = messages[messages.length - 1]?.created_at;

    return json({
      success: true,
      migrated: transformed.length,
      skipped,
      done: messages.length < batchSize,
      nextCursor: lastCursor || null,
      totalFetched: messages.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[migrate-messages-to-external]", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}