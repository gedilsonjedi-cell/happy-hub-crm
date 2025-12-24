import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body, null, 2));

    // Handle payment notification
    if (body.type === "payment" && body.data?.id) {
      const paymentId = body.data.id;

      // Fetch payment details from Mercado Pago
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      const payment = await paymentResponse.json();
      console.log("Payment details:", JSON.stringify(payment, null, 2));

      // Update payment status in database
      const { data: pixPayment, error: fetchError } = await supabase
        .from("pix_payments")
        .select("*")
        .eq("mercadopago_id", paymentId.toString())
        .single();

      if (fetchError) {
        console.error("Error fetching payment record:", fetchError);
      }

      if (pixPayment) {
        // Update payment status
        await supabase
          .from("pix_payments")
          .update({
            status: payment.status,
            paid_at: payment.status === "approved" ? new Date().toISOString() : null,
          })
          .eq("id", pixPayment.id);

        // If payment approved, credit balance or activate subscription
        if (payment.status === "approved") {
          const externalRef = payment.external_reference ? JSON.parse(payment.external_reference) : null;

          if (externalRef?.paymentType === "balance") {
            // Credit organization balance
            await supabase.rpc("credit_organization_balance", {
              _organization_id: pixPayment.organization_id,
              _amount: pixPayment.amount,
              _description: "Recarga via PIX - Mercado Pago",
              _reference_type: "pix_payment",
              _reference_id: pixPayment.id,
            });

            console.log(`Credited ${pixPayment.amount} to organization ${pixPayment.organization_id}`);
          } else if (externalRef?.paymentType === "subscription") {
            // Update subscription status
            const subscriptionEnd = new Date();
            subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

            await supabase
              .from("organizations")
              .update({
                subscription_status: "active",
                subscription_started_at: new Date().toISOString(),
                subscription_ends_at: subscriptionEnd.toISOString(),
                plan: "pro",
              })
              .eq("id", pixPayment.organization_id);

            console.log(`Activated subscription for organization ${pixPayment.organization_id}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
