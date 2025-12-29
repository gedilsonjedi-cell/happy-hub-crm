import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN not configured");
    }

    const {
      amount,
      description,
      payerEmail,
      payerName,
      organizationId,
      paymentType,
      cardNumber,
      cardExpiryMonth,
      cardExpiryYear,
      cardCvv,
      cardHolder,
      cpf,
    } = await req.json();

    if (!amount || !payerEmail || !organizationId || !cardNumber || !cpf) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // First, create a card token
    const tokenResponse = await fetch("https://api.mercadopago.com/v1/card_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        card_number: cardNumber,
        expiration_month: cardExpiryMonth,
        expiration_year: cardExpiryYear,
        security_code: cardCvv,
        cardholder: {
          name: cardHolder,
          identification: {
            type: "CPF",
            number: cpf,
          },
        },
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token error:", errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Erro ao processar cartão. Verifique os dados.",
          details: errorData 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResponse.json();

    // Create payment with the token
    const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${organizationId}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        token: tokenData.id,
        description: description || "Recarga de saldo",
        installments: 1, // À vista only
        payment_method_id: tokenData.payment_method?.id || "visa",
        payer: {
          email: payerEmail,
          first_name: payerName?.split(" ")[0] || "",
          last_name: payerName?.split(" ").slice(1).join(" ") || "",
          identification: {
            type: "CPF",
            number: cpf,
          },
        },
        metadata: {
          organization_id: organizationId,
          payment_type: paymentType,
        },
      }),
    });

    const paymentData = await paymentResponse.json();
    console.log("Payment response:", paymentData);

    if (!paymentResponse.ok || paymentData.status === "rejected") {
      const errorMessage = getPaymentErrorMessage(paymentData.status_detail);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          status: paymentData.status,
          status_detail: paymentData.status_detail
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If approved, add credits to balance
    if (paymentData.status === "approved") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get current balance
      const { data: balanceData } = await supabase
        .from("organization_balance")
        .select("*")
        .eq("organization_id", organizationId)
        .single();

      const currentBalance = balanceData?.balance || 0;
      const newBalance = currentBalance + amount;

      if (balanceData) {
        // Update existing balance
        await supabase
          .from("organization_balance")
          .update({
            balance: newBalance,
            total_credits_added: (balanceData.total_credits_added || 0) + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId);
      } else {
        // Create new balance record
        await supabase
          .from("organization_balance")
          .insert({
            organization_id: organizationId,
            balance: amount,
            total_credits_added: amount,
            total_spent: 0,
          });
      }

      // Record transaction
      await supabase
        .from("balance_transactions")
        .insert({
          organization_id: organizationId,
          type: "credit",
          amount: amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Recarga via Cartão - R$ ${amount.toFixed(2)}`,
          reference_type: "card_payment",
          reference_id: paymentData.id.toString(),
        });
    }

    return new Response(
      JSON.stringify({
        success: paymentData.status === "approved",
        status: paymentData.status,
        paymentId: paymentData.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing card payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getPaymentErrorMessage(statusDetail: string): string {
  const errorMessages: Record<string, string> = {
    cc_rejected_bad_filled_card_number: "Número do cartão inválido",
    cc_rejected_bad_filled_date: "Data de validade inválida",
    cc_rejected_bad_filled_other: "Dados do cartão incorretos",
    cc_rejected_bad_filled_security_code: "CVV inválido",
    cc_rejected_blacklist: "Cartão não autorizado",
    cc_rejected_call_for_authorize: "Ligue para a operadora para autorizar",
    cc_rejected_card_disabled: "Cartão desabilitado",
    cc_rejected_duplicated_payment: "Pagamento duplicado",
    cc_rejected_high_risk: "Pagamento recusado por segurança",
    cc_rejected_insufficient_amount: "Saldo insuficiente",
    cc_rejected_invalid_installments: "Parcelas não permitidas",
    cc_rejected_max_attempts: "Limite de tentativas excedido",
    cc_rejected_other_reason: "Pagamento recusado pela operadora",
  };

  return errorMessages[statusDetail] || "Pagamento não aprovado. Tente novamente.";
}
