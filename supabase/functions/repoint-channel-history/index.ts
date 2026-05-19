// Repoint conversation history from old channel_ids to a new active channel_id.
// Handles unique-constraint conflicts (deletes conflicting old-channel rows) and
// batches large updates to avoid statement timeouts.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const fromChannelIds: string[] = body.fromChannelIds ?? [];
    const toChannelId: string = body.toChannelId;
    const organizationId: string = body.organizationId;
    const onlyTable: string | undefined = body.onlyTable;
    const batchSize: number = body.batchSize ?? 500;

    if (!fromChannelIds.length || !toChannelId || !organizationId) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") ?? "",
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const results: Record<string, any> = {};

    // ---- 1. whatsapp_messages — batched by id ----
    if (!onlyTable || onlyTable === "whatsapp_messages") {
      let totalUpdated = 0;
      let lastError: string | null = null;
      let iter = 0;
      while (iter < 200) {
        iter++;
        const { data: rows, error: selErr } = await ext
          .from("whatsapp_messages")
          .select("id")
          .in("channel_id", fromChannelIds)
          .limit(batchSize);
        if (selErr) { lastError = selErr.message; break; }
        if (!rows || rows.length === 0) break;
        const ids = rows.map((r: any) => r.id);
        const { error: updErr } = await ext
          .from("whatsapp_messages")
          .update({ channel_id: toChannelId, organization_id: organizationId })
          .in("id", ids);
        if (updErr) { lastError = updErr.message; break; }
        totalUpdated += ids.length;
      }
      results.whatsapp_messages = { updated: totalUpdated, batches: iter, error: lastError };
    }

    // ---- 2. whatsapp_contacts — single update ----
    if (!onlyTable || onlyTable === "whatsapp_contacts") {
      const { error, count } = await ext
        .from("whatsapp_contacts")
        .update({ channel_id: toChannelId, organization_id: organizationId }, { count: "exact" })
        .in("channel_id", fromChannelIds)
        .select("id", { head: true, count: "exact" });
      results.whatsapp_contacts = { updated: count ?? 0, error: error?.message ?? null };
    }

    // ---- 3. conversation_assignments — handle unique(conversation_phone, channel_id) ----
    if (!onlyTable || onlyTable === "conversation_assignments") {
      // Find existing target-channel phones
      const { data: existing, error: exErr } = await ext
        .from("conversation_assignments")
        .select("conversation_phone")
        .eq("channel_id", toChannelId);
      if (exErr) {
        results.conversation_assignments = { error: exErr.message };
      } else {
        const existingPhones = new Set((existing ?? []).map((r: any) => r.conversation_phone));

        // Pull all old-channel assignments
        let allOld: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error } = await ext
            .from("conversation_assignments")
            .select("id, conversation_phone, updated_at")
            .in("channel_id", fromChannelIds)
            .order("updated_at", { ascending: false })
            .range(offset, offset + 999);
          if (error) { results.conversation_assignments = { error: error.message }; break; }
          if (!data || data.length === 0) break;
          allOld = allOld.concat(data);
          if (data.length < 1000) break;
          offset += 1000;
        }

        // Dedupe within old set (keep most recent per phone)
        const seenPhones = new Set<string>();
        const toDelete: string[] = [];
        const toUpdate: string[] = [];
        for (const r of allOld) {
          if (existingPhones.has(r.conversation_phone)) {
            toDelete.push(r.id);
          } else if (seenPhones.has(r.conversation_phone)) {
            toDelete.push(r.id); // older dupe within old set
          } else {
            seenPhones.add(r.conversation_phone);
            toUpdate.push(r.id);
          }
        }

        let deletedCount = 0;
        let delError: string | null = null;
        for (let i = 0; i < toDelete.length; i += 500) {
          const chunk = toDelete.slice(i, i + 500);
          const { error } = await ext.from("conversation_assignments").delete().in("id", chunk);
          if (error) { delError = error.message; break; }
          deletedCount += chunk.length;
        }

        let updatedCount = 0;
        let updError: string | null = null;
        for (let i = 0; i < toUpdate.length; i += 500) {
          const chunk = toUpdate.slice(i, i + 500);
          const { error } = await ext
            .from("conversation_assignments")
            .update({ channel_id: toChannelId, organization_id: organizationId })
            .in("id", chunk);
          if (error) { updError = error.message; break; }
          updatedCount += chunk.length;
        }

        results.conversation_assignments = {
          totalOld: allOld.length,
          deleted_duplicates: deletedCount,
          updated: updatedCount,
          delError, updError,
        };
      }
    }

    // ---- 4. conversation_stats — already done previously but idempotent ----
    if (!onlyTable || onlyTable === "conversation_stats") {
      const { error, count } = await ext
        .from("conversation_stats")
        .update({ channel_id: toChannelId, organization_id: organizationId }, { count: "exact" })
        .in("channel_id", fromChannelIds)
        .select("id", { head: true, count: "exact" });
      results.conversation_stats = { updated: count ?? 0, error: error?.message ?? null };
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
