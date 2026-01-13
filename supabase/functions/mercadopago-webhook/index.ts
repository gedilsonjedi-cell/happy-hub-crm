import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

      // Find payment record in database
      const { data: pixPayment, error: fetchError } = await supabase
        .from("pix_payments")
        .select("*")
        .eq("mercadopago_id", paymentId.toString())
        .single();

      if (fetchError) {
        console.error("Error fetching payment record:", fetchError);
        // Payment not found in our database - ignore
        return new Response(JSON.stringify({ received: true, ignored: "payment_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!pixPayment) {
        console.log("Payment record not found for mercadopago_id:", paymentId);
        return new Response(JSON.stringify({ received: true, ignored: "no_record" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // CRITICAL: Check if payment was already processed to prevent double-crediting
      if (pixPayment.paid_at && pixPayment.status === "approved") {
        console.log("Payment already processed at:", pixPayment.paid_at, "- Ignoring duplicate webhook");
        return new Response(JSON.stringify({ received: true, ignored: "already_processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Handle REFUND/CHARGEBACK - CRITICAL: Debit balance when money is returned
      if (payment.status === "refunded" || payment.status === "cancelled" || payment.status === "charged_back") {
        console.log(`⚠️ REFUND/CHARGEBACK DETECTED for payment ${paymentId} - Status: ${payment.status}`);
        
        // Only process refund if the payment was previously approved and credited
        if (pixPayment.status === "approved" && pixPayment.paid_at) {
          console.log(`Processing refund for organization: ${pixPayment.organization_id}, amount: ${pixPayment.amount}`);
          
          const externalRef = pixPayment.payment_type ? pixPayment.payment_type : null;
          
          if (externalRef === "balance") {
            // Debit the organization balance - money was returned
            const { error: debitError } = await supabase.rpc("debit_organization_balance", {
              _organization_id: pixPayment.organization_id,
              _amount: pixPayment.amount,
              _description: `Estorno PIX - Pagamento ${paymentId} devolvido`,
              _reference_type: "pix_refund",
              _reference_id: pixPayment.id,
            });

            if (debitError) {
              console.error("ERROR debiting balance for refund:", debitError);
              // Still update the status to track the refund attempt
            } else {
              console.log(`✅ SUCCESS: Debited ${pixPayment.amount} from organization ${pixPayment.organization_id} due to refund`);
            }
          } else if (externalRef === "subscription") {
            // Cancel/suspend subscription if payment was refunded
            const { error: updateError } = await supabase
              .from("organizations")
              .update({
                subscription_status: "suspended",
              })
              .eq("id", pixPayment.organization_id);

            if (updateError) {
              console.error("ERROR suspending subscription due to refund:", updateError);
            } else {
              console.log(`✅ SUCCESS: Suspended subscription for organization ${pixPayment.organization_id} due to refund`);
            }
          }
          
          // Update payment status to reflect refund
          await supabase
            .from("pix_payments")
            .update({
              status: payment.status,
            })
            .eq("id", pixPayment.id);
            
          console.log(`Payment ${paymentId} status updated to: ${payment.status}`);
        } else {
          console.log(`Payment ${paymentId} was not previously approved - no refund action needed`);
          // Still update the status
          await supabase
            .from("pix_payments")
            .update({
              status: payment.status,
            })
            .eq("id", pixPayment.id);
        }
      }
      // Only process if Mercado Pago confirms approved status
      else if (payment.status === "approved") {
        console.log("Processing approved payment for organization:", pixPayment.organization_id);

        const externalRef = payment.external_reference ? JSON.parse(payment.external_reference) : null;

        if (externalRef?.paymentType === "balance") {
          // Credit organization balance
          const { error: rpcError } = await supabase.rpc("credit_organization_balance", {
            _organization_id: pixPayment.organization_id,
            _amount: pixPayment.amount,
            _description: "Recarga via PIX - Mercado Pago",
            _reference_type: "pix_payment",
            _reference_id: pixPayment.id,
          });

          if (rpcError) {
            console.error("ERROR crediting balance:", rpcError);
            // Don't update paid_at so it can be retried
            return new Response(JSON.stringify({ error: "Failed to credit balance" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`SUCCESS: Credited ${pixPayment.amount} to organization ${pixPayment.organization_id}`);
        } else if (externalRef?.paymentType === "subscription") {
          // Update subscription status
          const subscriptionEnd = new Date();
          subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

          const { error: updateError } = await supabase
            .from("organizations")
            .update({
              subscription_status: "active",
              subscription_started_at: new Date().toISOString(),
              subscription_ends_at: subscriptionEnd.toISOString(),
              plan: "pro",
            })
            .eq("id", pixPayment.organization_id);

          if (updateError) {
            console.error("ERROR activating subscription:", updateError);
            return new Response(JSON.stringify({ error: "Failed to activate subscription" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`SUCCESS: Activated subscription for organization ${pixPayment.organization_id}`);
        }

        // Update payment status AFTER successful processing
        const { error: updateError } = await supabase
          .from("pix_payments")
          .update({
            status: payment.status,
            paid_at: new Date().toISOString(),
          })
          .eq("id", pixPayment.id);

        if (updateError) {
          console.error("Error updating payment record:", updateError);
        }
      } else {
        // Update status for non-approved payments (pending, rejected, etc.)
        await supabase
          .from("pix_payments")
          .update({
            status: payment.status,
          })
          .eq("id", pixPayment.id);

        console.log(`Payment status updated to: ${payment.status}`);
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
