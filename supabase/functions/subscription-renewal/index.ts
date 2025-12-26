import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Organization {
  id: string;
  name: string;
  subscription_paid_until: string | null;
  subscription_status: string;
}

interface OrganizationAddon {
  id: string;
  quantity: number;
  price_per_unit: number;
  store_products: {
    name: string;
  } | null;
}

interface Organization {
  id: string;
  name: string;
  subscription_paid_until: string | null;
  subscription_status: string;
  has_paid_first_subscription: boolean;
  is_partner: boolean;
}

interface OrganizationAddon {
  id: string;
  quantity: number;
  price_per_unit: number;
  store_products: {
    name: string;
  } | null;
}

interface SubscriptionPricing {
  base_price: number;
  promotional_price: number;
}

interface RenewalResult {
  organization_id: string;
  organization_name: string;
  success: boolean;
  total_charged: number;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting subscription renewal process...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get subscription pricing
    const { data: pricing, error: pricingError } = await supabase
      .from("subscription_pricing")
      .select("base_price, promotional_price")
      .limit(1)
      .single();

    if (pricingError) {
      console.error("Error fetching pricing:", pricingError);
      throw new Error("Could not fetch subscription pricing");
    }

    const basePrice = (pricing as SubscriptionPricing)?.base_price || 229.90;
    const promotionalPrice = (pricing as SubscriptionPricing)?.promotional_price || 129.90;
    console.log(`Subscription prices - Base: R$ ${basePrice}, Promotional: R$ ${promotionalPrice}`);

    // Find organizations with expired or expiring today subscriptions
    const today = new Date().toISOString().split("T")[0];
    
    const { data: organizations, error: orgsError } = await supabase
      .from("organizations")
      .select("id, name, subscription_paid_until, subscription_status, has_paid_first_subscription, is_partner")
      .lte("subscription_paid_until", today)
      .eq("subscription_status", "active")
      .eq("is_partner", false);

    if (orgsError) {
      console.error("Error fetching organizations:", orgsError);
      throw new Error("Could not fetch organizations for renewal");
    }

    console.log(`Found ${(organizations as Organization[] || []).length} organizations needing renewal`);

    const results: RenewalResult[] = [];

    for (const org of (organizations as Organization[]) || []) {
      console.log(`Processing renewal for: ${org.name} (${org.id})`);

      try {
        // Get active add-ons for this organization
        const { data: addons, error: addonsError } = await supabase
          .from("organization_addons")
          .select(`
            id,
            quantity,
            price_per_unit,
            store_products (name)
          `)
          .eq("organization_id", org.id)
          .eq("is_active", true);

        if (addonsError) {
          console.error(`Error fetching addons for ${org.id}:`, addonsError);
          throw new Error("Could not fetch add-ons");
        }

        // Determine subscription price based on whether it's first subscription
        const isFirstSubscription = !org.has_paid_first_subscription;
        const subscriptionPrice = isFirstSubscription ? promotionalPrice : basePrice;

        // Calculate total: subscription price + add-ons
        const typedAddons = (addons || []) as unknown as OrganizationAddon[];
        const addonsTotal = typedAddons.reduce(
          (sum, addon) => sum + addon.quantity * addon.price_per_unit,
          0
        );
        const totalAmount = subscriptionPrice + addonsTotal;

        console.log(`Organization ${org.name}: ${isFirstSubscription ? 'PROMOTIONAL' : 'REGULAR'} R$ ${subscriptionPrice} + Add-ons R$ ${addonsTotal} = Total R$ ${totalAmount}`);

        // Check if organization has enough balance
        const { data: balanceCheck, error: balanceError } = await supabase
          .rpc("check_organization_balance", {
            _amount: totalAmount,
            _organization_id: org.id,
          });

        if (balanceError) {
          console.error(`Error checking balance for ${org.id}:`, balanceError);
          throw new Error("Could not check balance");
        }

        if (!balanceCheck) {
          console.log(`Organization ${org.name} has insufficient balance`);
          
          // Update subscription status to indicate payment needed
          await supabase
            .from("organizations")
            .update({
              subscription_status: "payment_required",
              updated_at: new Date().toISOString(),
            })
            .eq("id", org.id);

          results.push({
            organization_id: org.id,
            organization_name: org.name,
            success: false,
            total_charged: 0,
            error: "Insufficient balance",
          });
          continue;
        }

        // Build description with pricing detail
        let description = isFirstSubscription 
          ? `Primeira mensalidade (promocional): R$ ${subscriptionPrice.toFixed(2)}`
          : `Renovação mensal: Plano Base R$ ${subscriptionPrice.toFixed(2)}`;
        
        if (typedAddons.length > 0) {
          const addonsList = typedAddons
            .map((a) => `${a.store_products?.name || 'Add-on'} x${a.quantity}`)
            .join(", ");
          description += ` + Add-ons (${addonsList}) R$ ${addonsTotal.toFixed(2)}`;
        }

        // Debit the balance
        const { data: debitSuccess, error: debitError } = await supabase
          .rpc("debit_organization_balance", {
            _organization_id: org.id,
            _amount: totalAmount,
            _description: description,
            _reference_type: "subscription_renewal",
            _reference_id: new Date().toISOString(),
          });

        if (debitError || !debitSuccess) {
          console.error(`Error debiting balance for ${org.id}:`, debitError);
          throw new Error("Could not debit balance");
        }

        // Update subscription_paid_until to +30 days from now
        const newPaidUntil = new Date();
        newPaidUntil.setDate(newPaidUntil.getDate() + 30);

        // Build update object
        const updateData: Record<string, unknown> = {
          subscription_paid_until: newPaidUntil.toISOString(),
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        };

        // Mark as having paid first subscription if this was promotional
        if (isFirstSubscription) {
          updateData.has_paid_first_subscription = true;
        }

        const { error: updateError } = await supabase
          .from("organizations")
          .update(updateData)
          .eq("id", org.id);

        if (updateError) {
          console.error(`Error updating subscription for ${org.id}:`, updateError);
          throw new Error("Could not update subscription");
        }

        console.log(`Successfully renewed subscription for ${org.name}. New paid until: ${newPaidUntil.toISOString()}`);

        results.push({
          organization_id: org.id,
          organization_name: org.name,
          success: true,
          total_charged: totalAmount,
        });

      } catch (error) {
        console.error(`Error processing renewal for ${org.id}:`, error);
        results.push({
          organization_id: org.id,
          organization_name: org.name,
          success: false,
          total_charged: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const totalCharged = results.reduce((sum, r) => sum + r.total_charged, 0);

    console.log(`Renewal process completed. Success: ${successCount}, Failed: ${failCount}, Total charged: R$ ${totalCharged}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful: successCount,
        failed: failCount,
        total_charged: totalCharged,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("Subscription renewal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
