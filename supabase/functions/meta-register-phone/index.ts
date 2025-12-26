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

    // Step 1: First check current status
    const statusUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,name_status,account_mode`;
    
    console.log(`[meta-register-phone] Checking phone status first...`);
    
    const initialStatusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    const initialStatus = await initialStatusResponse.json();
    console.log(`[meta-register-phone] Initial status:`, JSON.stringify(initialStatus));

    // If already connected/registered, no need to register again
    if (initialStatus.status === 'CONNECTED') {
      console.log(`[meta-register-phone] Phone already connected!`);
      return new Response(
        JSON.stringify({ 
          success: true,
          registered: true,
          alreadyConnected: true,
          status: initialStatus,
          message: 'Número já está registrado e conectado!'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 2: Try to register the phone number
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    
    const registerPayload = {
      messaging_product: 'whatsapp',
      pin: pin || '123456' // Default PIN
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

    let registerSuccess = false;
    let registerError = null;

    if (registerData.error) {
      const errorCode = registerData.error.code;
      const errorMessage = registerData.error.message || '';
      
      // Check if it's "already registered" error - this is OK
      if (errorCode === 131031 || errorMessage.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered (expected)`);
        registerSuccess = true;
      } 
      // Error 131000 is a generic Meta error - could be temporary or config issue
      else if (errorCode === 131000) {
        console.log(`[meta-register-phone] Got error 131000 - checking if phone is actually registered...`);
        registerError = {
          code: errorCode,
          message: 'Erro genérico do Meta. O número pode já estar registrado em outro app ou haver um problema temporário.',
          suggestion: 'Verifique no Meta Business Suite se o número está ativo. Se persistir, pode ser necessário criar um novo app no Meta Developer Console.'
        };
      }
      else {
        console.error(`[meta-register-phone] Register error:`, registerData.error);
        registerError = {
          code: errorCode,
          message: registerData.error.message || 'Erro ao registrar número',
          details: registerData.error
        };
      }
    } else {
      registerSuccess = true;
    }

    // Step 3: Subscribe phone number to webhook (IMPORTANT for receiving messages!)
    console.log(`[meta-register-phone] Subscribing phone to webhook...`);
    
    const subscribeUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/subscribed_apps`;
    
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });

    const subscribeData = await subscribeResponse.json();
    console.log(`[meta-register-phone] Subscribe response:`, JSON.stringify(subscribeData));

    // Step 4: Always check final status
    console.log(`[meta-register-phone] Fetching final phone status...`);
    
    const finalStatusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    const finalStatus = await finalStatusResponse.json();
    console.log(`[meta-register-phone] Final status:`, JSON.stringify(finalStatus));
    
    // Add subscription info to status
    finalStatus.webhookSubscribed = subscribeData.success === true;
    // If status shows CONNECTED, the phone is working regardless of register errors
    const isConnected = finalStatus.status === 'CONNECTED';
    
    if (isConnected) {
      return new Response(
        JSON.stringify({ 
          success: true,
          registered: true,
          status: finalStatus,
          message: 'Número está conectado e pronto para uso!'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If we had a register error and status is not CONNECTED
    if (registerError) {
      return new Response(
        JSON.stringify({ 
          error: registerError.message,
          code: registerError.code,
          suggestion: registerError.suggestion,
          status: finalStatus,
          details: registerError.details
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Register was successful but status not yet CONNECTED
    return new Response(
      JSON.stringify({ 
        success: true,
        registered: registerSuccess,
        status: finalStatus,
        message: finalStatus.status === 'PENDING' 
          ? 'Registro enviado. Aguarde a verificação do Meta.'
          : `Status atual: ${finalStatus.status || 'Desconhecido'}`
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
