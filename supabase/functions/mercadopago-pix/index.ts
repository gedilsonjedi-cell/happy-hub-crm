import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PixPaymentRequest {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  organizationId: string;
  paymentType: "balance" | "subscription";
}

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

    const { amount, description, payerEmail, payerName, organizationId, paymentType }: PixPaymentRequest = await req.json();

    if (!amount || !payerEmail || !organizationId) {
      throw new Error("Missing required fields: amount, payerEmail, organizationId");
    }

    // Create PIX payment via Mercado Pago API
    const paymentData = {
      transaction_amount: amount,
      description: description || `Pagamento WhatsCode - ${paymentType === "balance" ? "Recarga de Saldo" : "Assinatura"}`,
      payment_method_id: "pix",
      payer: {
        email: payerEmail,
        first_name: payerName?.split(" ")[0] || "Cliente",
        last_name: payerName?.split(" ").slice(1).join(" ") || "",
      },
      external_reference: JSON.stringify({
        organizationId,
        paymentType,
        amount,
      }),
    };

    console.log("Creating PIX payment:", JSON.stringify(paymentData, null, 2));

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(paymentData),
    });

    const mpResult = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Mercado Pago error:", JSON.stringify(mpResult, null, 2));
      throw new Error(mpResult.message || "Failed to create PIX payment");
    }

    console.log("PIX payment created:", JSON.stringify(mpResult, null, 2));

    // Store payment record in database
    const { error: insertError } = await supabase.from("pix_payments").insert({
      organization_id: organizationId,
      mercadopago_id: mpResult.id.toString(),
      amount: amount,
      status: mpResult.status,
      payment_type: paymentType,
      pix_qr_code: mpResult.point_of_interaction?.transaction_data?.qr_code || null,
      pix_qr_code_base64: mpResult.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      pix_copy_paste: mpResult.point_of_interaction?.transaction_data?.qr_code || null,
      expires_at: mpResult.date_of_expiration || null,
    });

    if (insertError) {
      console.error("Error storing payment:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        paymentId: mpResult.id,
        status: mpResult.status,
        qrCode: mpResult.point_of_interaction?.transaction_data?.qr_code,
        qrCodeBase64: mpResult.point_of_interaction?.transaction_data?.qr_code_base64,
        expiresAt: mpResult.date_of_expiration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error creating PIX payment:", error);
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
