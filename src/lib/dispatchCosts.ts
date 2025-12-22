import { supabase } from "@/integrations/supabase/client";

interface RecordDispatchCostParams {
  userId: string;
  campaignId?: string;
  organizationId?: string;
  dispatchType: "marketing" | "utility" | "service";
  successfulCount: number;
}

/**
 * Records dispatch costs after successful message delivery
 * Only call this for messages that were successfully delivered
 */
export async function recordDispatchCost({
  userId,
  campaignId,
  organizationId,
  dispatchType,
  successfulCount,
}: RecordDispatchCostParams): Promise<{ success: boolean; totalCost: number }> {
  try {
    // Get pricing for this dispatch type
    const { data: pricing, error: pricingError } = await supabase
      .from("dispatch_pricing")
      .select("price_per_message")
      .eq("dispatch_type", dispatchType)
      .single();

    if (pricingError || !pricing) {
      console.error("Error fetching dispatch pricing:", pricingError);
      return { success: false, totalCost: 0 };
    }

    const pricePerMessage = Number(pricing.price_per_message);
    const totalCost = Math.round(pricePerMessage * successfulCount * 100) / 100;

    // Check if there's already a record for this campaign today
    const today = new Date().toISOString().split("T")[0];
    
    const { data: existingCost, error: existingError } = await supabase
      .from("dispatch_costs")
      .select("id, successful_count, total_cost")
      .eq("user_id", userId)
      .eq("dispatch_date", today)
      .eq("dispatch_type", dispatchType)
      .eq("campaign_id", campaignId || null)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing cost:", existingError);
    }

    if (existingCost) {
      // Update existing record
      const newCount = existingCost.successful_count + successfulCount;
      const newTotal = Math.round(pricePerMessage * newCount * 100) / 100;

      const { error: updateError } = await supabase
        .from("dispatch_costs")
        .update({
          successful_count: newCount,
          total_cost: newTotal,
        })
        .eq("id", existingCost.id);

      if (updateError) {
        console.error("Error updating dispatch cost:", updateError);
        return { success: false, totalCost: 0 };
      }

      return { success: true, totalCost: newTotal };
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from("dispatch_costs")
        .insert({
          user_id: userId,
          campaign_id: campaignId || null,
          organization_id: organizationId || null,
          dispatch_type: dispatchType,
          successful_count: successfulCount,
          price_per_message: pricePerMessage,
          total_cost: totalCost,
          dispatch_date: today,
        });

      if (insertError) {
        console.error("Error recording dispatch cost:", insertError);
        return { success: false, totalCost: 0 };
      }

      return { success: true, totalCost };
    }
  } catch (err) {
    console.error("Error in recordDispatchCost:", err);
    return { success: false, totalCost: 0 };
  }
}

/**
 * Get the dispatch type for a template
 */
export async function getTemplateDispatchType(templateId: string): Promise<"marketing" | "utility" | "service" | null> {
  try {
    const { data, error } = await supabase
      .from("message_templates")
      .select("dispatch_type")
      .eq("id", templateId)
      .single();

    if (error || !data) {
      console.error("Error fetching template dispatch type:", error);
      return null;
    }

    return data.dispatch_type as "marketing" | "utility" | "service";
  } catch (err) {
    console.error("Error in getTemplateDispatchType:", err);
    return null;
  }
}
