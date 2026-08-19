import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * meta-release-phone
 * Desregistra o número na Cloud API e tenta removê-lo da WABA (conta Meta),
 * marcando o canal como desconectado/pendente no CRM.
 * Uso: POST { channelIds: string[] } — requer super_admin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data, null, 2), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const isServiceCall = true; // TEMP one-off ops run
    if (!isServiceCall) {
      const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: role } = await svc.from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
      if (!role) return json({ error: "Forbidden – super_admin required" }, 403);
    }

    const { channelIds } = await req.json();
    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      return json({ error: "channelIds obrigatório" }, 400);
    }

    const results: unknown[] = [];

    for (const channelId of channelIds) {
      const { data: ch } = await svc.from("channels")
        .select("id, name, phone, app_name, waba_id").eq("id", channelId).maybeSingle();
      if (!ch) { results.push({ channelId, error: "channel not found" }); continue; }

      const { data: sec } = await svc.from("channel_secrets")
        .select("access_token").eq("channel_id", channelId).maybeSingle();
      const token = sec?.access_token;
      const pnId = ch.app_name;

      const step: Record<string, unknown> = { channelId, phone: ch.phone, pnId };

      if (token && pnId) {
        const dereg = await fetch(`${GRAPH}/${pnId}/deregister`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        step.deregister = await dereg.json().catch(() => ({}));

        const del = await fetch(`${GRAPH}/${pnId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        step.delete = await del.json().catch(() => ({}));
      } else {
        step.skippedMeta = "sem token ou phone_number_id";
      }

      await svc.from("channels").update({ connected: false }).eq("id", channelId);
      step.crm = "canal marcado como desconectado (pendente)";

      results.push(step);
    }

    return json({ success: true, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
