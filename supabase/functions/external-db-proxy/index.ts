import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * external-db-proxy
 *
 * Proxy edge function to read whatsapp_messages and leads from an external
 * Supabase instance, reducing Lovable Cloud resource consumption.
 *
 * Supported actions:
 *   - messages:  paginated message fetch (replaces direct client queries)
 *   - leads:     paginated lead fetch
 *   - lead_by_phone: find lead by phone variants
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: validate caller ──────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JWT via internal Supabase
    const internalSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await internalSupabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // ── External DB client ─────────────────────────────────────────
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

    if (!extUrl || !extKey) {
      return new Response(
        JSON.stringify({ error: "External database not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const extSupabase = createClient(extUrl, extKey);

    // ── Get user's organization_id for tenant isolation ────────────
    const { data: profile } = await internalSupabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "No organization found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const organizationId = profile.organization_id;

    // ── Parse request body ─────────────────────────────────────────
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "messages": {
        return await handleMessages(extSupabase, organizationId, body);
      }
      case "leads": {
        return await handleLeads(extSupabase, organizationId, body);
      }
      case "lead_by_phone": {
        return await handleLeadByPhone(extSupabase, organizationId, body);
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[external-db-proxy] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════════════════════════════════════════════════════════════════
// HANDLERS
// ══════════════════════════════════════════════════════════════════

async function handleMessages(
  ext: ReturnType<typeof createClient>,
  _organizationId: string,
  body: Record<string, unknown>
) {
  const {
    channelId,
    phoneVariants,
    cursor,
    pageSize = 25,
  } = body as {
    channelId: string;
    phoneVariants: string[];
    cursor: string | null;
    pageSize?: number;
  };

  if (!channelId || !phoneVariants?.length) {
    return new Response(
      JSON.stringify({ error: "channelId and phoneVariants required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const cursorFilter = cursor || new Date(Date.now() + 120_000).toISOString();

  const essentialSelect =
    "id, channel_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

  const inboundPhoneFilter = phoneVariants
    .map((p: string) => `sender_phone.eq.${p}`)
    .join(",");
  const outboundPhoneFilter = phoneVariants
    .map((p: string) => `metadata->>destination.eq.${p}`)
    .join(",");

  const [inboundResult, outboundResult] = await Promise.all([
    ext
      .from("whatsapp_messages")
      .select(essentialSelect)
      .eq("channel_id", channelId)
      .eq("direction", "inbound")
      .or(inboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize),
    ext
      .from("whatsapp_messages")
      .select(essentialSelect)
      .eq("channel_id", channelId)
      .eq("direction", "outbound")
      .or(outboundPhoneFilter)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize),
  ]);

  const inbound = inboundResult.data || [];
  const outbound = outboundResult.data || [];

  // Merge, sort, dedup
  const merged = [...inbound, ...outbound].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const seen = new Set<string>();
  const unique = merged.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  const page = unique.slice(0, pageSize);
  const hasMore = unique.length >= pageSize;
  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1].created_at : null;

  return new Response(
    JSON.stringify({ messages: page, nextCursor, hasMore }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleLeads(
  ext: ReturnType<typeof createClient>,
  organizationId: string,
  body: Record<string, unknown>
) {
  const {
    page = 0,
    pageSize = 50,
    search,
    tagIds,
  } = body as {
    page?: number;
    pageSize?: number;
    search?: string;
    tagIds?: string[];
  };

  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = ext
    .from("leads")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  if (tagIds && tagIds.length > 0) {
    query = query.contains("tag_ids", tagIds);
  }

  const { data, count, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ leads: data, total: count }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleLeadByPhone(
  ext: ReturnType<typeof createClient>,
  organizationId: string,
  body: Record<string, unknown>
) {
  const { phoneVariants } = body as { phoneVariants: string[] };

  if (!phoneVariants?.length) {
    return new Response(
      JSON.stringify({ error: "phoneVariants required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const phoneFilter = phoneVariants
    .map((p: string) => `phone.eq.${p}`)
    .join(",");

  const { data, error } = await ext
    .from("leads")
    .select("*")
    .eq("organization_id", organizationId)
    .or(phoneFilter)
    .limit(1)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ lead: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
