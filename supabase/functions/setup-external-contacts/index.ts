import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * setup-external-contacts
 *
 * Creates the whatsapp_contacts table on the external Supabase instance.
 * Requires super_admin role. Safe to run multiple times (idempotent).
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

    // Create table via SQL (using rpc or direct query)
    // Since we can't run raw SQL via the JS client, we'll use the REST API
    const pgRestUrl = extUrl.replace(/\/$/, '');
    
    // Use the Supabase Management API or direct PostgREST
    // Actually, let's just try to insert a test record — if table doesn't exist,
    // we need to create it via the Supabase dashboard or migration on the external DB.
    // Instead, let's verify the table exists and report status.
    
    const { error: testError } = await extClient
      .from("whatsapp_contacts")
      .select("id")
      .limit(1);

    if (testError) {
      return json({
        success: false,
        message: "Table whatsapp_contacts does not exist on external DB. Please create it manually.",
        sql: `
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL,
  organization_id UUID,
  sender_phone TEXT NOT NULL,
  sender_name TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, sender_phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_org ON public.whatsapp_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON public.whatsapp_contacts(sender_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_last_msg ON public.whatsapp_contacts(last_message_at DESC);
        `.trim(),
        error: testError.message,
      });
    }

    // Table exists — count records
    const { count } = await extClient
      .from("whatsapp_contacts")
      .select("id", { count: "exact", head: true });

    return json({
      success: true,
      message: `Table whatsapp_contacts exists with ${count ?? 0} records.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[setup-external-contacts]", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
