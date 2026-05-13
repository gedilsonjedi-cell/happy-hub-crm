import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const internalServiceRole = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const HISTORY_SCAN_BATCH_SIZE = 300;
const HISTORY_SCAN_MAX_BATCHES = 40;

type MessageRecord = {
  id: string;
  channel_id: string | null;
  organization_id: string | null;
  message_id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: string;
  content: string | null;
  media_url: string | null;
  direction: string;
  status: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  error_message?: string | null;
  is_read?: boolean | null;
};

type ConversationStatsRow = {
  conversation_phone: string;
  last_message_content: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number | null;
  sender_name: string | null;
};

type PhoneLookup = {
  exact: Set<string>;
  suffixes: Set<string>;
};

function normalizePhoneValue(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function buildPhoneLookup(phoneVariants: string[]): PhoneLookup {
  const exact = new Set(
    phoneVariants.map((phone) => normalizePhoneValue(phone)).filter(Boolean)
  );

  const suffixes = new Set<string>();
  exact.forEach((phone) => {
    if (phone.length >= 9) suffixes.add(phone.slice(-9));
    if (phone.length >= 8) suffixes.add(phone.slice(-8));
  });

  return { exact, suffixes };
}

function phoneMatchesLookup(candidate: unknown, lookup: PhoneLookup): boolean {
  const normalized = normalizePhoneValue(candidate);

  if (!normalized) return false;
  if (lookup.exact.has(normalized)) return true;

  for (const suffix of lookup.suffixes) {
    if (normalized.endsWith(suffix)) return true;
  }

  return false;
}

function getOutboundPhoneCandidates(message: MessageRecord): unknown[] {
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;

  return [
    metadata.destination,
    metadata.to,
    metadata.phone,
    metadata.contact_phone,
    metadata.contactPhone,
    metadata.recipient_phone,
    metadata.recipientPhone,
  ];
}

function messageMatchesConversation(
  message: MessageRecord,
  direction: "inbound" | "outbound",
  lookup: PhoneLookup
): boolean {
  if (direction === "inbound") {
    return phoneMatchesLookup(message.sender_phone, lookup);
  }

  return getOutboundPhoneCandidates(message).some((candidate) =>
    phoneMatchesLookup(candidate, lookup)
  );
}

function getSyntheticMessageDirection(
  row: ConversationStatsRow
): "inbound" | "outbound" {
  if (!row.last_inbound_at) {
    return "outbound";
  }

  if (!row.last_message_at) {
    return "inbound";
  }

  return new Date(row.last_inbound_at).getTime() >=
    new Date(row.last_message_at).getTime()
    ? "inbound"
    : "outbound";
}

function buildSyntheticMessageFromStats(
  channelId: string,
  row: ConversationStatsRow
): MessageRecord | null {
  const createdAt = row.last_message_at ?? row.last_inbound_at;

  if (!createdAt || !row.last_message_content?.trim()) {
    return null;
  }

  const direction = getSyntheticMessageDirection(row);

  return {
    id: `stats_${channelId}_${row.conversation_phone}_${createdAt}`,
    channel_id: channelId,
    organization_id: null,
    message_id: `stats_${channelId}_${row.conversation_phone}_${createdAt}`,
    sender_phone: row.conversation_phone,
    sender_name: row.sender_name,
    message_type: row.last_message_content.startsWith("Template:")
      ? "template"
      : "text",
    content: row.last_message_content,
    media_url: null,
    direction,
    status: direction === "inbound" ? "received" : "sent",
    created_at: createdAt,
    metadata:
      direction === "outbound"
        ? {
            destination: row.conversation_phone,
            synthetic: true,
            source: "conversation_stats",
          }
        : { synthetic: true, source: "conversation_stats" },
    error_message: null,
    is_read: direction === "outbound" || (row.unread_count ?? 0) === 0,
  };
}

async function fetchConversationMessagesByDirection(
  ext: ReturnType<typeof createClient>,
  organizationId: string,
  channelId: string,
  direction: "inbound" | "outbound",
  cursorFilter: string,
  pageSize: number,
  lookup: PhoneLookup,
  selectFields: string
): Promise<MessageRecord[]> {
  const matched: MessageRecord[] = [];
  const seen = new Set<string>();
  const exactConversationIds = Array.from(lookup.exact);

  const appendMatches = (rows: MessageRecord[]) => {
    rows.forEach((row) => {
      if (!seen.has(row.id) && messageMatchesConversation(row, direction, lookup)) {
        seen.add(row.id);
        matched.push(row);
      }
    });
  };

  if (exactConversationIds.length > 0) {
    const { data, error } = await ext
      .from("whatsapp_messages")
      .select(selectFields)
      .eq("organization_id", String(organizationId))
      .in("channel_id", exactConversationIds)
      .eq("direction", direction)
      .lt("created_at", cursorFilter)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1);

    if (error) {
      console.warn(
        `[external-db-proxy] Failed exact ${direction} lookup for conversation ${exactConversationIds.join(",")}: ${error.message}`
      );
    } else {
      appendMatches((data ?? []) as MessageRecord[]);
    }
  }

  if (matched.length >= pageSize + 1 || !channelId) {
    return matched;
  }

  let scanCursor = cursorFilter;

  for (let batchIndex = 0; batchIndex < HISTORY_SCAN_MAX_BATCHES; batchIndex += 1) {
    const { data, error } = await ext
      .from("whatsapp_messages")
      .select(selectFields)
      .eq("organization_id", String(organizationId))
      .eq("channel_id", String(channelId))
      .eq("direction", direction)
      .lt("created_at", scanCursor)
      .order("created_at", { ascending: false })
      .limit(HISTORY_SCAN_BATCH_SIZE);

    if (error) {
      console.warn(
        `[external-db-proxy] Failed to read ${direction} history for channel ${channelId}: ${error.message}`
      );
      break;
    }

    const rows = (data ?? []) as MessageRecord[];
    if (rows.length === 0) break;

    appendMatches(rows);

    if (matched.length >= pageSize + 1 || rows.length < HISTORY_SCAN_BATCH_SIZE) {
      break;
    }

    const nextCursor = rows[rows.length - 1]?.created_at;
    if (!nextCursor || nextCursor === scanCursor) {
      break;
    }

    scanCursor = nextCursor;
  }

  return matched;
}

async function fetchLatestConversationStatsMessage(
  _organizationId: string,
  channelId: string,
  lookup: PhoneLookup
): Promise<MessageRecord | null> {
  const phoneFilter = Array.from(lookup.exact)
    .map((phone) => `conversation_phone.eq.${phone}`)
    .join(",");

  if (!phoneFilter) {
    return null;
  }

  const channelIdStr = String(channelId);
  const { data, error } = await internalServiceRole
    .from("conversation_stats")
    .select(
      "conversation_phone, last_message_content, last_message_at, last_inbound_at, unread_count, sender_name"
    )
    .filter("channel_id", "eq", channelIdStr)
    .or(phoneFilter)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return buildSyntheticMessageFromStats(channelId, data as ConversationStatsRow);
}

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

    const internalSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: userData, error: userError } =
      await internalSupabase.auth.getUser();

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // ── Parse request body ─────────────────────────────────────────
    const body = await req.json();
    const { action, impersonatedOrgId } = body as {
      action?: string;
      impersonatedOrgId?: string | null;
    };

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

    let organizationId = String(profile.organization_id);

    if (typeof impersonatedOrgId === "string" && impersonatedOrgId.trim()) {
      const { data: roleData } = await internalServiceRole
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (roleData) {
        organizationId = impersonatedOrgId;
      }
    }

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

    switch (action) {
      case "messages": {
        return await handleMessages(extSupabase, organizationId, body);
      }
      case "lead_messages": {
        return await handleLeadMessages(extSupabase, organizationId, body);
      }
      case "leads": {
        return await handleLeads(extSupabase, organizationId, body);
      }
      case "lead_by_phone": {
        return await handleLeadByPhone(extSupabase, organizationId, body);
      }
      case "bulk_previews": {
        return await handleBulkPreviews(extSupabase, organizationId, body);
      }
      case "upsert_contact": {
        return await handleUpsertContact(extSupabase, body);
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
  organizationId: string,
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

  if (!phoneVariants?.length) {
    return new Response(
      JSON.stringify({ error: "phoneVariants required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const cursorFilter = cursor || new Date(Date.now() + 120_000).toISOString();
  const phoneLookup = buildPhoneLookup(phoneVariants);

  const essentialSelect =
    "id, channel_id, organization_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

  const [inbound, outbound, latestSyntheticMessage] = await Promise.all([
    fetchConversationMessagesByDirection(
      ext,
      organizationId,
      channelId,
      "inbound",
      cursorFilter,
      pageSize,
      phoneLookup,
      essentialSelect
    ),
    fetchConversationMessagesByDirection(
      ext,
      organizationId,
      channelId,
      "outbound",
      cursorFilter,
      pageSize,
      phoneLookup,
      essentialSelect
    ),
    cursor
      ? Promise.resolve(null)
      : fetchLatestConversationStatsMessage(organizationId, channelId, phoneLookup),
  ]);

  // Merge, sort, dedup
  const merged = [...inbound, ...outbound];

  if (latestSyntheticMessage) {
    const syntheticTime = new Date(latestSyntheticMessage.created_at).getTime();
    const newestActualTime = merged.reduce((latest, message) => {
      const current = new Date(message.created_at).getTime();
      return Number.isFinite(current) && current > latest ? current : latest;
    }, 0);

    const hasEquivalentRealMessage = merged.some((message) => {
      const messageTime = new Date(message.created_at).getTime();
      return (
        Math.abs(messageTime - syntheticTime) < 1000 &&
        message.direction === latestSyntheticMessage.direction &&
        message.content === latestSyntheticMessage.content
      );
    });

    if (!hasEquivalentRealMessage && syntheticTime >= newestActualTime) {
      merged.push(latestSyntheticMessage);
    }
  }

  merged.sort(
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

async function handleLeadMessages(
  ext: ReturnType<typeof createClient>,
  organizationId: string,
  body: Record<string, unknown>
) {
  const {
    phoneVariants,
    channelIds = [],
    limit = 100,
  } = body as {
    phoneVariants: string[];
    channelIds?: string[];
    limit?: number;
  };

  if (!phoneVariants?.length) {
    return new Response(JSON.stringify({ error: "phoneVariants required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const phoneLookup = buildPhoneLookup(phoneVariants);
  const suffixes = Array.from(phoneLookup.suffixes).sort((a, b) => b.length - a.length);
  const inboundOr = suffixes.map((suffix) => `sender_phone.like.%${suffix}`).join(",");
  const outboundOr = suffixes
    .flatMap((suffix) =>
      ["destination", "to", "phone", "contact_phone", "contactPhone", "recipient_phone", "recipientPhone"]
        .map((field) => `metadata->>${field}.like.%${suffix}`)
    )
    .join(",");

  if (!suffixes.length || !inboundOr || !outboundOr) {
    return new Response(JSON.stringify({ messages: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const selectFields =
    "id, channel_id, organization_id, message_id, sender_phone, sender_name, message_type, content, media_url, direction, status, created_at, metadata, error_message, is_read";

  const buildQuery = (direction: "inbound" | "outbound", scopedToChannels: boolean) => {
    let query = ext
      .from("whatsapp_messages")
      .select(selectFields)
      .eq("organization_id", organizationId)
      .eq("direction", direction);

    if (scopedToChannels && channelIds.length > 0) {
      query = query.in("channel_id", channelIds);
    }

    return query;
  };

  const runPair = async (scopedToChannels: boolean) => {
    const [inboundResult, outboundResult] = await Promise.all([
      buildQuery("inbound", scopedToChannels).or(inboundOr).order("created_at", { ascending: false }).limit(limit),
      buildQuery("outbound", scopedToChannels).or(outboundOr).order("created_at", { ascending: false }).limit(limit),
    ]);

    if (inboundResult.error) throw inboundResult.error;
    if (outboundResult.error) throw outboundResult.error;
    return ([...(inboundResult.data ?? []), ...(outboundResult.data ?? [])] as MessageRecord[]);
  };

  let rows = await runPair(channelIds.length > 0);
  if (rows.length === 0 && channelIds.length > 0) {
    rows = await runPair(false);
  }

  const seen = new Set<string>();
  const messages = rows
    .filter((message) => {
      if (seen.has(message.id)) return false;
      const direction = message.direction === "outbound" ? "outbound" : "inbound";
      if (!messageMatchesConversation(message, direction, phoneLookup)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return new Response(JSON.stringify({ messages }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    .filter("organization_id", "eq", String(organizationId))
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
    .filter("organization_id", "eq", String(organizationId))
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

/**
 * Bulk preview fetcher: given an array of { channelId, phone } pairs,
 * returns the latest message content + time for each conversation.
 * This replaces N individual proxy calls with a single batch request.
 */
async function handleBulkPreviews(
  ext: ReturnType<typeof createClient>,
  organizationId: string,
  body: Record<string, unknown>
) {
  const { conversations } = body as {
    conversations: Array<{ channelId: string; phoneVariants: string[] }>;
  };

  if (!conversations?.length) {
    return new Response(
      JSON.stringify({ previews: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Limit to 50 conversations per request to avoid timeouts
  const batch = conversations.slice(0, 50);

  const results = await Promise.all(
    batch.map(async (conv) => {
      try {
          const lookup = buildPhoneLookup(conv.phoneVariants);
          const phoneNormalized = Array.from(lookup.exact);

          if (phoneNormalized.length === 0 && !conv.channelId) {
            throw new Error("No valid phone variants");
          }

          let latest: MessageRecord | null = null;

          if (phoneNormalized.length > 0) {
            const { data, error } = await ext
              .from("whatsapp_messages")
              .select("content, message_type, direction, created_at, sender_name, sender_phone, metadata")
              .eq("organization_id", String(organizationId))
              .in("channel_id", phoneNormalized)
              .order("created_at", { ascending: false })
              .limit(1);

            if (!error && data?.length) {
              latest = data[0] as MessageRecord;
            }
          }

          if (!latest && conv.channelId) {
            let scanCursor = new Date(Date.now() + 120_000).toISOString();

            for (let batchIndex = 0; batchIndex < 8; batchIndex += 1) {
              const { data, error } = await ext
                .from("whatsapp_messages")
                .select("content, message_type, direction, created_at, sender_name, sender_phone, metadata")
                .eq("organization_id", String(organizationId))
                .eq("channel_id", String(conv.channelId))
                .lt("created_at", scanCursor)
                .order("created_at", { ascending: false })
                .limit(50);

              if (error) break;

              const rows = (data ?? []) as MessageRecord[];
              if (rows.length === 0) break;

              latest = rows.find((row) => {
                const rowDirection = row.direction === "outbound" ? "outbound" : "inbound";
                return messageMatchesConversation(row, rowDirection, lookup);
              }) ?? null;

              if (latest || rows.length < 50) break;

              const nextCursor = rows[rows.length - 1]?.created_at;
              if (!nextCursor || nextCursor === scanCursor) break;
              scanCursor = nextCursor;
            }
          }

        return {
          channelId: conv.channelId,
          phone: conv.phoneVariants[0] || "",
          content: latest?.content || null,
          messageType: latest?.message_type || null,
          direction: latest?.direction || null,
          createdAt: latest?.created_at || null,
          senderName: latest?.sender_name || null,
            lastInboundAt: latest?.direction === "inbound" ? latest?.created_at : null,
        };
      } catch {
        return {
          channelId: conv.channelId,
          phone: conv.phoneVariants[0] || "",
          content: null,
          messageType: null,
          direction: null,
          createdAt: null,
          senderName: null,
          lastInboundAt: null,
        };
      }
    })
  );

  return new Response(
    JSON.stringify({ previews: results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Upsert a contact in the external whatsapp_contacts table.
 * Creates the table if it doesn't exist (idempotent).
 */
async function handleUpsertContact(
  ext: ReturnType<typeof createClient>,
  body: Record<string, unknown>
) {
  const { channelId, organizationId, senderPhone, senderName, lastMessageAt } =
    body as {
      channelId: string;
      organizationId: string;
      senderPhone: string;
      senderName: string | null;
      lastMessageAt: string;
    };

  if (!channelId || !senderPhone) {
    return new Response(
      JSON.stringify({ error: "channelId and senderPhone required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Upsert the contact — cast IDs to strings to avoid text/uuid mismatch
  const { error } = await ext
    .from("whatsapp_contacts")
    .upsert(
      {
        channel_id: String(channelId),
        organization_id: organizationId ? String(organizationId) : null,
        sender_phone: senderPhone,
        sender_name: senderName || null,
        last_message_at: lastMessageAt || new Date().toISOString(),
      },
      { onConflict: "channel_id,sender_phone", ignoreDuplicates: false }
    );

  if (error) {
    // Table might not exist yet — log but don't fail
    console.warn("[upsert_contact] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
