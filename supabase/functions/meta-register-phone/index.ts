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
    const { phoneNumberId, accessToken, pin, forceReregister } = await req.json();

    console.log(`[meta-register-phone] Registering phone: ${phoneNumberId}, forceReregister: ${forceReregister}`);

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

    const statusUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,name_status,account_mode,is_official_business_account,messaging_limit_tier`;

    // Step 1: Check current status
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

    // If status is CONNECTED and not forcing, we're good
    if (initialStatus.status === 'CONNECTED' && !forceReregister) {
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

    // If forceReregister or status is PENDING, try to DEREGISTER first
    if (forceReregister || initialStatus.status === 'PENDING') {
      console.log(`[meta-register-phone] Attempting DEREGISTER first for stuck PENDING number...`);
      
      const deregisterUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/deregister`;
      
      const deregisterResponse = await fetch(deregisterUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });

      const deregisterData = await deregisterResponse.json();
      console.log(`[meta-register-phone] Deregister response:`, JSON.stringify(deregisterData));
      
      // Wait for Meta to process deregistration
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Step 2: Register the phone number
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    
    const registerPayload = {
      messaging_product: 'whatsapp',
      pin: pin || '123456'
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
      const errorSubcode = registerData.error.error_subcode;
      
      if (errorCode === 131031 || errorMessage.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered`);
        registerSuccess = true;
      } 
      else if (errorCode === 136025 || errorSubcode === 136025) {
        registerError = {
          code: errorCode,
          message: 'PIN de verificação inválido.',
          requiresPin: true,
          suggestion: 'Insira o PIN de 6 dígitos definido no Meta Business Suite.'
        };
      }
      else if (errorCode === 131000) {
        registerError = {
          code: errorCode,
          message: 'Erro do Meta. Pode haver uma pendência no número.',
          suggestion: 'Acesse o Meta Business Suite > WhatsApp Manager e verifique pendências.'
        };
      }
      else if (errorCode === 100) {
        registerError = {
          code: errorCode,
          message: 'Número não está associado ao WABA corretamente.',
          suggestion: 'Verifique no Meta Business Suite se o número está vinculado ao WABA.'
        };
      }
      else {
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

    // Step 3: Subscribe to webhook
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

    // Step 4: Check final status
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const finalStatusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });

    const finalStatus = await finalStatusResponse.json();
    console.log(`[meta-register-phone] Final status:`, JSON.stringify(finalStatus));
    
    finalStatus.webhookSubscribed = subscribeData.success === true;

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

    // If still PENDING
    if (finalStatus.status === 'PENDING') {
      return new Response(
        JSON.stringify({ 
          success: false,
          pending: true,
          status: finalStatus,
          message: 'Número continua pendente. Isso geralmente significa que o número precisa de verificação no Meta.',
          suggestion: 'O número pode precisar de verificação de dois fatores (2FA) ou migração de provedor. Acesse: business.facebook.com > WhatsApp Manager > Configurações do telefone > Complete a verificação.',
          actions: [
            'Verifique se há SMS/chamada de verificação pendente',
            'Confirme a verificação de dois fatores no Meta',
            'Se migrou de outro provedor, aguarde até 24h'
          ]
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: registerSuccess,
        registered: registerSuccess,
        status: finalStatus,
        message: `Status: ${finalStatus.status || 'Desconhecido'}`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[meta-register-phone] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
