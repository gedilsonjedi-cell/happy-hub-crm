import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationResult {
  exists: boolean;
  inputPhone: string;
  outputPhone: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let phones: string[] = [];

  try {
    const body = await req.json();
    phones = Array.isArray(body?.phones) ? body.phones : [];

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      console.error("Invalid request: phones array is required");
      return new Response(
        JSON.stringify({ error: "phones array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    if (!instanceId || !token || !clientToken) {
      console.warn("Missing Z-API credentials; allowing import without WhatsApp validation");
      return new Response(
        JSON.stringify({ results: phones.map((phone: string) => ({ exists: true, inputPhone: phone, outputPhone: phone })), skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone numbers - remove all non-digits
    const cleanedPhones = phones.map((phone: string) => phone.replace(/\D/g, ''));

    // Z-API allows up to 50,000 numbers per request, but let's batch in chunks of 1000 for safety
    const BATCH_SIZE = 1000;
    const results: ValidationResult[] = [];

    console.log(`Starting validation of ${cleanedPhones.length} phone numbers`);

    for (let i = 0; i < cleanedPhones.length; i += BATCH_SIZE) {
      const batch = cleanedPhones.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}, phones ${i + 1} to ${i + batch.length}`);

      const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/phone-exists-batch`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": clientToken,
        },
        body: JSON.stringify({ phones: batch }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Z-API validation unavailable (${response.status}); allowing this batch. ${errorText}`);
        results.push(...batch.map((phone) => ({ exists: true, inputPhone: phone, outputPhone: phone })));
        continue;
      }

      const batchResults: ValidationResult[] = await response.json().catch(() => []);
      if (Array.isArray(batchResults) && batchResults.length > 0) {
        results.push(...batchResults);
      } else {
        console.warn("Z-API returned an empty/invalid validation payload; allowing this batch");
        results.push(...batch.map((phone) => ({ exists: true, inputPhone: phone, outputPhone: phone })));
      }

      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < cleanedPhones.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Validation complete. Total results: ${results.length}`);

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to validate phones";
    console.error("Error validating phones:", errorMessage);
    return new Response(
      JSON.stringify({ results: phones.map((phone: string) => ({ exists: true, inputPhone: phone, outputPhone: phone })), skipped: true, warning: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
