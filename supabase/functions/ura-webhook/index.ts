import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface URAPayload {
  // Phone number of the caller (formato E.164 ou DDD+número)
  phone?: string;
  caller_phone?: string;
  numero?: string;
  telefone?: string;
  // Optional: custom data from URA
  option?: string;
  opcao?: string;
  [key: string]: unknown;
}

function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading zeros
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Add Brazil country code if not present
  if (!cleaned.startsWith('55') && cleaned.length <= 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Expected URL: /ura-webhook/{channelId}
  // pathParts will be like: ["ura-webhook", "channel-uuid"]
  const channelId = pathParts[pathParts.length - 1];
  
  if (!channelId || channelId === 'ura-webhook') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Channel ID not provided in URL. Use /ura-webhook/{channelId}" 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log(`[URA Webhook] Received request for channel: ${channelId}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse payload (support both GET and POST)
    let payload: URAPayload = {};
    
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        payload = await req.json();
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        for (const [key, value] of formData.entries()) {
          payload[key] = value;
        }
      }
    } else if (req.method === "GET") {
      for (const [key, value] of url.searchParams.entries()) {
        payload[key] = value;
      }
    }

    console.log(`[URA Webhook] Payload:`, JSON.stringify(payload));

    // Extract phone number from various possible field names
    const rawPhone = payload.phone || payload.caller_phone || payload.numero || payload.telefone;
    
    if (!rawPhone) {
      await logWebhook(supabase, channelId, "", false, false, "Phone number not provided", payload);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Phone number not provided. Send 'phone', 'caller_phone', 'numero', or 'telefone' field." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedPhone = formatPhoneNumber(String(rawPhone));
    console.log(`[URA Webhook] Formatted phone: ${formattedPhone}`);

    // Fetch URA config for this channel
    const { data: uraConfig, error: configError } = await supabase
      .from("ura_config")
      .select(`
        *,
        channel:channels(
          id, name, phone, access_token, organization_id, waba_id
        ),
        template:message_templates(
          id, name, content, variables, variable_mappings
        )
      `)
      .eq("channel_id", channelId)
      .single();

    if (configError || !uraConfig) {
      console.error(`[URA Webhook] Config not found for channel ${channelId}:`, configError);
      await logWebhook(supabase, channelId, formattedPhone, false, false, "URA config not found for this channel", payload);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "URA not configured for this channel" 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if URA is enabled
    if (!uraConfig.is_enabled) {
      console.log(`[URA Webhook] URA disabled for channel ${channelId}`);
      await logWebhook(supabase, channelId, formattedPhone, false, false, "URA is disabled", payload);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "URA is disabled for this channel" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if template is configured
    if (!uraConfig.template_id || !uraConfig.template) {
      console.error(`[URA Webhook] No template configured for channel ${channelId}`);
      await logWebhook(supabase, channelId, formattedPhone, false, false, "No template configured", payload);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No template configured for URA" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channel = uraConfig.channel;
    const template = uraConfig.template;
    const organizationId = channel.organization_id;

    console.log(`[URA Webhook] Queueing template "${template.name}" to ${formattedPhone}`);

    // Process lead creation + send in background — respond immediately
    const processInBackground = async () => {
      let leadCreated = false;
      try {
        if (uraConfig.create_lead_if_not_exists) {
          // Fast lookup: exact match on normalized phone only (indexed)
          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("phone", formattedPhone)
            .limit(1)
            .maybeSingle();

          if (!existingLead) {
            const { error: leadError } = await supabase
              .from("leads")
              .insert({
                organization_id: organizationId,
                user_id: channel.user_id || (await getFirstAdminUserId(supabase, organizationId)),
                phone: formattedPhone,
                name: `URA - ${formattedPhone}`,
                status: "new",
                notes: `Lead criado via URA em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              });
            if (leadError) {
              console.error(`[URA Webhook] Error creating lead:`, leadError);
            } else {
              leadCreated = true;
            }
          }
        }

        const templateParams: string[] = [];
        if (template.variables && template.variables.length > 0) {
          for (const varName of template.variables) {
            templateParams.push(varName);
          }
        }

        const metaSendResponse = await fetch(`${supabaseUrl}/functions/v1/meta-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            channelId: channel.id,
            destination: formattedPhone,
            templateName: template.name,
            templateParams: templateParams.length > 0 ? templateParams : undefined,
            templateLanguage: "pt_BR",
            source: "ura"
          }),
        });

        const metaResult = await metaSendResponse.json();
        if (metaResult.success) {
          console.log(`[URA Webhook] ✓ Sent to ${formattedPhone}`);
          await logWebhook(supabase, channelId, formattedPhone, true, leadCreated, null, payload);
        } else {
          console.error(`[URA Webhook] ✗ Failed:`, metaResult.error);
          await logWebhook(supabase, channelId, formattedPhone, false, leadCreated, metaResult.error || metaResult.message, payload);
        }
      } catch (e) {
        console.error("[URA Webhook] Background error:", e);
        await logWebhook(supabase, channelId, formattedPhone, false, leadCreated, e instanceof Error ? e.message : String(e), payload);
      }
    };

    // @ts-ignore EdgeRuntime is provided by Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processInBackground());
    } else {
      processInBackground();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Template dispatch queued",
        phone: formattedPhone,
        template: template.name
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[URA Webhook] Error:", error);
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper to log webhook calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logWebhook(
  supabase: any,
  channelId: string,
  phone: string,
  templateSent: boolean,
  leadCreated: boolean,
  errorMessage: string | null,
  metadata: unknown
) {
  try {
    await supabase.from("ura_webhook_logs").insert({
      channel_id: channelId,
      caller_phone: phone,
      template_sent: templateSent,
      lead_created: leadCreated,
      error_message: errorMessage,
      metadata: metadata
    });
  } catch (e) {
    console.error("[URA Webhook] Failed to log:", e);
  }
}

// Helper to get first admin user ID for lead creation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFirstAdminUserId(
  supabase: any,
  organizationId: string
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .limit(1)
    .single();
  
  return profile?.user_id || "";
}
