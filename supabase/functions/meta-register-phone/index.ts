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
    const statusUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,name_status,account_mode,is_official_business_account,messaging_limit_tier`;
    
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

    // Check for token errors
    if (initialStatus.error) {
      console.error(`[meta-register-phone] Status check error:`, initialStatus.error);
      return new Response(
        JSON.stringify({ 
          error: `Erro ao verificar status: ${initialStatus.error.message || 'Token inválido'}`,
          code: initialStatus.error.code,
          suggestion: 'Verifique se o Access Token está correto e não expirado.'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If status is CONNECTED, we're good
    if (initialStatus.status === 'CONNECTED') {
      console.log(`[meta-register-phone] Phone already CONNECTED!`);
      return new Response(
        JSON.stringify({ 
          success: true,
          registered: true,
          alreadyConnected: true,
          status: initialStatus,
          message: 'Número já está conectado!'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 2: Try to register the phone number
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    
    // Use provided PIN or default
    const registerPayload = {
      messaging_product: 'whatsapp',
      pin: pin || '123456'
    };

    console.log(`[meta-register-phone] Calling register API for ${phoneNumberId} with PIN`);
    
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
      const errorSubcode = registerData.error.error_subcode;
      
      // Check if it's "already registered" error - this is OK
      if (errorCode === 131031 || errorMessage.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered (expected)`);
        registerSuccess = true;
      } 
      // Error 136025 is invalid PIN
      else if (errorCode === 136025 || errorSubcode === 136025) {
        console.log(`[meta-register-phone] Invalid PIN error`);
        registerError = {
          code: errorCode,
          message: 'PIN de verificação inválido. Por favor, insira o PIN correto.',
          requiresPin: true,
          suggestion: 'Se você não definiu um PIN, tente 123456 ou acesse o Meta Business Suite para verificar.'
        };
      }
      // Error 131000 is a generic Meta error
      else if (errorCode === 131000) {
        console.log(`[meta-register-phone] Got error 131000 - generic error`);
        registerError = {
          code: errorCode,
          message: 'Erro genérico do Meta. Pode haver um problema temporário ou o número precisa de ação no Meta Business Suite.',
          suggestion: 'Acesse o Meta Business Suite > WhatsApp Manager e verifique se há alguma pendência para este número.'
        };
      }
      // Error 100 with subcode 33 - phone not in WABA
      else if (errorCode === 100) {
        console.log(`[meta-register-phone] Error 100 - possible WABA issue`);
        registerError = {
          code: errorCode,
          message: 'Este número pode não estar associado ao WABA correto ou precisa ser adicionado primeiro.',
          suggestion: 'Verifique no Meta Business Suite se o número está vinculado à conta WhatsApp Business correta.'
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
      console.log(`[meta-register-phone] Registration successful!`);
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
    
    // Wait a bit for Meta to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
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
    
    // If status shows CONNECTED, the phone is working
    if (finalStatus.status === 'CONNECTED') {
      return new Response(
        JSON.stringify({ 
          success: true,
          registered: true,
          status: finalStatus,
          message: 'Número conectado com sucesso!'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If we had a register error and status is still PENDING
    if (registerError) {
      return new Response(
        JSON.stringify({ 
          error: registerError.message,
          code: registerError.code,
          suggestion: registerError.suggestion,
          requiresPin: registerError.requiresPin,
          status: finalStatus,
          details: registerError.details
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If still PENDING after registration attempt
    if (finalStatus.status === 'PENDING') {
      return new Response(
        JSON.stringify({ 
          success: false,
          pending: true,
          status: finalStatus,
          message: 'Número ainda está pendente. Pode ser necessário verificar no Meta Business Suite.',
          suggestion: 'Acesse: Meta Business Suite > WhatsApp Manager > Configurações do telefone e complete qualquer verificação pendente.'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Other success scenarios
    return new Response(
      JSON.stringify({ 
        success: registerSuccess,
        registered: registerSuccess,
        status: finalStatus,
        message: `Status atual: ${finalStatus.status || 'Desconhecido'}`
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
