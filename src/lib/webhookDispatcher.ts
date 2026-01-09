import { supabase } from "@/integrations/supabase/client";

export type WebhookEvent =
  | "message_created"
  | "message_updated"
  | "conversation_created"
  | "conversation_status_changed"
  | "contact_created"
  | "contact_updated"
  | "pipeline_stage_changed"
  | "campaign_completed";

interface DispatchWebhookParams {
  organizationId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
}

/**
 * Dispatches a webhook event to all configured webhooks for the organization
 * This function is fire-and-forget - it won't block the main flow
 */
export async function dispatchWebhook({
  organizationId,
  event,
  data,
}: DispatchWebhookParams): Promise<void> {
  try {
    // Fire and forget - don't await to not block main flow
    supabase.functions
      .invoke("webhook-dispatcher", {
        body: {
          organization_id: organizationId,
          event,
          data,
        },
      })
      .then((response) => {
        if (response.error) {
          console.error("Webhook dispatch error:", response.error);
        } else {
          console.log("Webhook dispatched:", event, response.data);
        }
      })
      .catch((error) => {
        console.error("Webhook dispatch failed:", error);
      });
  } catch (error) {
    console.error("Error initiating webhook dispatch:", error);
  }
}

/**
 * Helper to dispatch webhook with await (use when you need confirmation)
 */
export async function dispatchWebhookSync({
  organizationId,
  event,
  data,
}: DispatchWebhookParams): Promise<{
  success: boolean;
  webhooks_triggered?: number;
  error?: string;
}> {
  try {
    const { data: result, error } = await supabase.functions.invoke(
      "webhook-dispatcher",
      {
        body: {
          organization_id: organizationId,
          event,
          data,
        },
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      webhooks_triggered: result?.webhooks_triggered || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
