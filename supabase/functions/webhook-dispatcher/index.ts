import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  organization_id: string;
  event: string;
  data: Record<string, unknown>;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  headers: Record<string, string> | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: WebhookPayload = await req.json();
    const { organization_id, event, data } = payload;

    if (!organization_id || !event) {
      return new Response(
        JSON.stringify({ error: "organization_id and event are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing webhook event: ${event} for org: ${organization_id}`);

    // Fetch active webhooks for this organization that listen to this event
    const { data: webhooks, error: fetchError } = await supabase
      .from("webhooks")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("is_active", true);

    if (fetchError) {
      console.error("Error fetching webhooks:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch webhooks" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter webhooks that listen to this specific event
    const matchingWebhooks = (webhooks as Webhook[]).filter(
      (webhook) => webhook.events.includes(event)
    );

    console.log(`Found ${matchingWebhooks.length} webhooks for event: ${event}`);

    const results: { webhook_id: string; success: boolean; status?: number; error?: string }[] = [];

    // Dispatch to each matching webhook
    for (const webhook of matchingWebhooks) {
      try {
        const webhookPayload = {
          event,
          timestamp: new Date().toISOString(),
          organization_id,
          data,
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "Optimus-CRM-Webhook/1.0",
          "X-Webhook-Event": event,
          "X-Webhook-ID": webhook.id,
        };

        // Add custom headers if configured
        if (webhook.headers && typeof webhook.headers === "object") {
          Object.assign(headers, webhook.headers);
        }

        console.log(`Dispatching to webhook: ${webhook.name} (${webhook.url})`);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify(webhookPayload),
        });

        results.push({
          webhook_id: webhook.id,
          success: response.ok,
          status: response.status,
        });

        if (!response.ok) {
          console.error(`Webhook ${webhook.name} failed with status: ${response.status}`);
        } else {
          console.log(`Webhook ${webhook.name} dispatched successfully`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error dispatching to webhook ${webhook.name}:`, error);
        results.push({
          webhook_id: webhook.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        event,
        webhooks_triggered: matchingWebhooks.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook dispatcher error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
