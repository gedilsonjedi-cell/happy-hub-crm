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
    const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN not configured");
    }

    const {
      organizationId,
      cardNumber,
      cardExpiryMonth,
      cardExpiryYear,
      cardCvv,
      cardHolder,
      cpf,
      email,
      minBalanceThreshold,
      rechargeAmount,
    } = await req.json();

    console.log("Saving card for organization:", organizationId);

    // First, create or get customer
    let customerId: string;

    // Search for existing customer
    const searchResponse = await fetch(
      `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(email)}`,
      {
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        },
      }
    );

    const searchData = await searchResponse.json();
    console.log("Customer search result:", searchData.results?.length || 0, "customers found");

    if (searchData.results && searchData.results.length > 0) {
      customerId = searchData.results[0].id;
      console.log("Using existing customer:", customerId);
    } else {
      // Create new customer
      const createCustomerResponse = await fetch(
        "https://api.mercadopago.com/v1/customers",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            first_name: cardHolder.split(" ")[0],
            last_name: cardHolder.split(" ").slice(1).join(" ") || cardHolder,
            identification: {
              type: "CPF",
              number: cpf,
            },
          }),
        }
      );

      const customerData = await createCustomerResponse.json();
      
      if (!createCustomerResponse.ok) {
        console.error("Error creating customer:", customerData);
        throw new Error(customerData.message || "Erro ao criar cliente");
      }

      customerId = customerData.id;
      console.log("Created new customer:", customerId);
    }

    // Create card token
    const tokenResponse = await fetch(
      "https://api.mercadopago.com/v1/card_tokens",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          card_number: cardNumber,
          expiration_month: parseInt(cardExpiryMonth),
          expiration_year: parseInt(cardExpiryYear),
          security_code: cardCvv,
          cardholder: {
            name: cardHolder,
            identification: {
              type: "CPF",
              number: cpf,
            },
          },
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Error creating card token:", tokenData);
      throw new Error(tokenData.message || "Erro ao validar cartão");
    }

    console.log("Card token created:", tokenData.id);

    // Save card to customer
    const saveCardResponse = await fetch(
      `https://api.mercadopago.com/v1/customers/${customerId}/cards`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: tokenData.id,
        }),
      }
    );

    const savedCardData = await saveCardResponse.json();

    if (!saveCardResponse.ok) {
      console.error("Error saving card to customer:", savedCardData);
      // If card already exists, it might return an error but we can continue
      if (!savedCardData.cause?.some((c: { code: string }) => c.code === "205")) {
        throw new Error(savedCardData.message || "Erro ao salvar cartão");
      }
    }

    console.log("Card saved to customer:", savedCardData.id || "already exists");

    return new Response(
      JSON.stringify({
        success: true,
        customerId,
        cardToken: savedCardData.id || tokenData.id,
        cardLastFour: cardNumber.slice(-4),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error saving card:", error);
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
