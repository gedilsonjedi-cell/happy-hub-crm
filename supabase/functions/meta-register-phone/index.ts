import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumberId, accessToken, pin } = await req.json();

    console.log(`[meta-register-phone] Registering phone: ${phoneNumberId}`);

    if (!phoneNumberId || !accessToken) {
      return new Response(
        JSON.stringify({ 
          error: 'Phone Number ID e Access Token são obrigatórios'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 1: Register the phone number with Meta Cloud API
    // This is required to enable the phone number for sending/receiving messages
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    
    const registerPayload: Record<string, string> = {
      messaging_product: 'whatsapp',
      pin: pin || '123456' // Default PIN if not provided
    };

    console.log(`[meta-register-phone] Calling register API for ${phoneNumberId}`);
    
    const registerResponse = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registerPayload)
    });

    const registerData = await registerResponse.json();
    
    console.log(`[meta-register-phone] Register response:`, JSON.stringify(registerData));

    if (registerData.error) {
      // Check if already registered
      if (registerData.error.code === 131031 || 
          registerData.error.message?.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered, checking status...`);
      } else {
        console.error(`[meta-register-phone] Register error:`, registerData.error);
        return new Response(
          JSON.stringify({ 
            error: registerData.error.message || 'Erro ao registrar número',
            code: registerData.error.code,
            details: registerData.error
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Step 2: Get phone number status
    const statusUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,name_status,account_mode`;
    
    console.log(`[meta-register-phone] Fetching phone status...`);
    
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    const statusData = await statusResponse.json();
    
    console.log(`[meta-register-phone] Status response:`, JSON.stringify(statusData));

    if (statusData.error) {
      return new Response(
        JSON.stringify({ 
          error: statusData.error.message || 'Erro ao verificar status',
          details: statusData.error
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        registered: !registerData.error || registerData.error.code === 131031,
        status: statusData
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[meta-register-phone] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno',
        details: errorMessage
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
