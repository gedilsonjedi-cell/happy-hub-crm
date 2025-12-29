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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { organizationId } = await req.json();

    console.log("Checking auto-recharge for organization:", organizationId);

    // Get auto-recharge config
    const { data: config, error: configError } = await supabase
      .from("auto_recharge_config")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true)
      .maybeSingle();

    if (configError) {
      console.error("Error fetching config:", configError);
      throw configError;
    }

    if (!config) {
      console.log("No active auto-recharge config found");
      return new Response(
        JSON.stringify({ success: true, message: "No auto-recharge configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current balance
    const { data: balance, error: balanceError } = await supabase
      .from("organization_balance")
      .select("balance")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (balanceError) {
      console.error("Error fetching balance:", balanceError);
      throw balanceError;
    }

    const currentBalance = balance?.balance || 0;
    console.log("Current balance:", currentBalance, "Threshold:", config.min_balance_threshold);

    // Check if balance is below threshold
    if (currentBalance >= config.min_balance_threshold) {
      console.log("Balance is above threshold, no recharge needed");
      return new Response(
        JSON.stringify({ success: true, message: "Balance above threshold" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Balance below threshold, initiating auto-recharge");

    // Get customer's saved cards
    const cardsResponse = await fetch(
      `https://api.mercadopago.com/v1/customers/${config.customer_id}/cards`,
      {
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        },
      }
    );

    const cards = await cardsResponse.json();

    if (!cards || cards.length === 0) {
      console.error("No saved cards found for customer");
      throw new Error("Nenhum cartão salvo encontrado");
    }

    // Use the first saved card
    const card = cards[0];
    console.log("Using card:", card.id, "Last four:", card.last_four_digits);

    // Create payment with saved card
    const paymentResponse = await fetch(
      "https://api.mercadopago.com/v1/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `auto-recharge-${organizationId}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: config.recharge_amount,
          token: card.id,
          description: `Recarga automática - R$ ${config.recharge_amount.toFixed(2)}`,
          installments: 1,
          payment_method_id: card.payment_method.id,
          payer: {
            id: config.customer_id,
          },
        }),
      }
    );

    const paymentData = await paymentResponse.json();
    console.log("Payment response:", paymentData.status, paymentData.id);

    if (paymentData.status === "approved") {
      // Credit the balance
      const { error: creditError } = await supabase.rpc("credit_organization_balance", {
        _organization_id: organizationId,
        _amount: config.recharge_amount,
        _description: `Recarga automática via cartão •••• ${config.card_last_four}`,
        _reference_type: "auto_recharge",
        _reference_id: paymentData.id.toString(),
      });

      if (creditError) {
        console.error("Error crediting balance:", creditError);
        throw creditError;
      }

      console.log("Auto-recharge successful!");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Recarga automática realizada com sucesso",
          amount: config.recharge_amount,
          paymentId: paymentData.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (paymentData.status === "rejected") {
      const errorMessages: Record<string, string> = {
        cc_rejected_bad_filled_card_number: "Número do cartão inválido",
        cc_rejected_bad_filled_date: "Data de validade inválida",
        cc_rejected_bad_filled_other: "Dados do cartão inválidos",
        cc_rejected_bad_filled_security_code: "Código de segurança inválido",
        cc_rejected_blacklist: "Cartão bloqueado",
        cc_rejected_call_for_authorize: "Autorização necessária - entre em contato com seu banco",
        cc_rejected_card_disabled: "Cartão desativado",
        cc_rejected_duplicated_payment: "Pagamento duplicado",
        cc_rejected_high_risk: "Pagamento recusado por segurança",
        cc_rejected_insufficient_amount: "Saldo insuficiente no cartão",
        cc_rejected_invalid_installments: "Parcelas inválidas",
        cc_rejected_max_attempts: "Limite de tentativas excedido",
        cc_rejected_other_reason: "Pagamento recusado",
      };

      const errorMessage = errorMessages[paymentData.status_detail] || "Pagamento recusado";
      console.error("Payment rejected:", paymentData.status_detail);

      // Optionally disable auto-recharge after failed attempt
      // await supabase
      //   .from("auto_recharge_config")
      //   .update({ is_enabled: false })
      //   .eq("id", config.id);

      throw new Error(errorMessage);
    } else {
      console.log("Payment status:", paymentData.status);
      return new Response(
        JSON.stringify({
          success: false,
          status: paymentData.status,
          message: "Pagamento em processamento",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error in auto-recharge:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
