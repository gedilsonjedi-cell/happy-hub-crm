import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status?: string;
}

interface MetaResponse {
  data: PhoneNumber[];
  error?: {
    message: string;
    code: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wabaId, accessToken } = await req.json();

    console.log(`[meta-fetch-phones] Fetching phone numbers for WABA: ${wabaId}`);

    if (!wabaId || !accessToken) {
      console.error('[meta-fetch-phones] Missing wabaId or accessToken');
      return new Response(
        JSON.stringify({ 
          error: 'WABA ID e Access Token são obrigatórios',
          phones: [] 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Fetch phone numbers from Meta Graph API
    const metaUrl = `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
    
    console.log(`[meta-fetch-phones] Calling Meta API for WABA ${wabaId}`);
    
    const response = await fetch(metaUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data: MetaResponse = await response.json();

    if (data.error) {
      console.error('[meta-fetch-phones] Meta API error:', data.error);
      
      let errorMessage = 'Erro ao buscar números do Meta';
      
      if (data.error.code === 190) {
        errorMessage = 'Access Token inválido ou expirado';
      } else if (data.error.code === 100) {
        errorMessage = 'WABA ID inválido ou sem permissão';
      } else if (data.error.message) {
        errorMessage = data.error.message;
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          phones: [],
          metaError: data.error
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const phones = data.data?.map((phone) => ({
      id: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      qualityRating: phone.quality_rating,
      codeVerificationStatus: phone.code_verification_status,
    })) || [];

    console.log(`[meta-fetch-phones] Found ${phones.length} phone numbers`);

    return new Response(
      JSON.stringify({ 
        success: true,
        phones 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[meta-fetch-phones] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno ao buscar números',
        phones: [],
        details: errorMessage
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
