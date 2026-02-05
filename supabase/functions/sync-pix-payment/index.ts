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

    const { paymentId, syncAll } = await req.json();

    // If syncing all pending payments
    if (syncAll) {
      console.log("Syncing all pending PIX payments...");
      
      // Get all pending payments from the last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      
      const { data: pendingPayments, error: fetchError } = await supabase
        .from("pix_payments")
        .select("*")
        .eq("status", "pending")
        .gte("created_at", oneDayAgo.toISOString());

      if (fetchError) {
        throw new Error(`Failed to fetch pending payments: ${fetchError.message}`);
      }

      console.log(`Found ${pendingPayments?.length || 0} pending payments to sync`);

      const results = [];
      for (const payment of pendingPayments || []) {
        if (!payment.mercadopago_id) continue;
        
        try {
          const result = await syncPayment(supabase, accessToken, payment.mercadopago_id, payment);
          results.push({ paymentId: payment.mercadopago_id, ...result });
        } catch (err) {
          results.push({ paymentId: payment.mercadopago_id, error: err.message });
        }
      }

      return new Response(JSON.stringify({ synced: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sync single payment
    if (!paymentId) {
      throw new Error("paymentId is required");
    }

    // Find payment record in database
    const { data: pixPayment, error: fetchError } = await supabase
      .from("pix_payments")
      .select("*")
      .eq("mercadopago_id", paymentId.toString())
      .single();

    if (fetchError || !pixPayment) {
      throw new Error("Payment not found in database");
    }

    const result = await syncPayment(supabase, accessToken, paymentId, pixPayment);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Sync error:", error);
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

async function syncPayment(supabase: any, accessToken: string, paymentId: string, pixPayment: any) {
  console.log(`Syncing payment ${paymentId}...`);

  // Fetch payment details from Mercado Pago
  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!paymentResponse.ok) {
    throw new Error(`Mercado Pago API error: ${paymentResponse.status}`);
  }

  const payment = await paymentResponse.json();
  console.log("Payment status from MP:", payment.status);

  // Already processed
  if (pixPayment.paid_at && pixPayment.status === "approved") {
    return { status: "already_processed", mpStatus: payment.status };
  }

  // Process approved payment
  if (payment.status === "approved") {
    console.log("Processing approved payment for organization:", pixPayment.organization_id);

    const externalRef = payment.external_reference ? JSON.parse(payment.external_reference) : null;

    if (externalRef?.paymentType === "balance") {
      // Credit organization balance
      const { error: rpcError } = await supabase.rpc("credit_organization_balance", {
        _organization_id: pixPayment.organization_id,
        _amount: pixPayment.amount,
        _description: "Recarga via PIX - Mercado Pago (Sync)",
        _reference_type: "pix_payment",
        _reference_id: pixPayment.id,
      });

      if (rpcError) {
        throw new Error(`Failed to credit balance: ${rpcError.message}`);
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
          subscription_paid_until: subscriptionEnd.toISOString(),
          plan: "pro",
        })
        .eq("id", pixPayment.organization_id);

      if (updateError) {
        throw new Error(`Failed to activate subscription: ${updateError.message}`);
      }

      console.log(`SUCCESS: Activated subscription for organization ${pixPayment.organization_id}`);
    }

    // Update payment status
    await supabase
      .from("pix_payments")
      .update({
        status: payment.status,
        paid_at: new Date().toISOString(),
      })
      .eq("id", pixPayment.id);

    return { status: "synced", mpStatus: payment.status, credited: true };
  }

  // Update status for non-approved payments
  await supabase
    .from("pix_payments")
    .update({
      status: payment.status,
    })
    .eq("id", pixPayment.id);

  return { status: "updated", mpStatus: payment.status, credited: false };
}
