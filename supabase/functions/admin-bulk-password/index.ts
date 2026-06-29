import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { organization_id, user_id, email, password, secret } = await req.json();
    if (secret !== "lov-bulk-9f3a2c7e-rz-2026") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let query = admin.from("profiles").select("user_id,email");
    if (user_id) query = query.eq("user_id", user_id);
    else if (email) query = query.ilike("email", email);
    else if (organization_id) query = query.eq("organization_id", organization_id);
    else throw new Error("organization_id, user_id ou email obrigatório");
    const { data: users, error } = await query;
    if (error) throw error;
    const results: any[] = [];
    for (const u of users ?? []) {
      const { error: e } = await admin.auth.admin.updateUserById(u.user_id, { password, email_confirm: true });
      results.push({ email: u.email, ok: !e, error: e?.message });
    }
    return new Response(JSON.stringify({ count: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
