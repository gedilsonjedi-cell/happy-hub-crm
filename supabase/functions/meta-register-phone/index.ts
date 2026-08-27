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

    console.log(`[meta-register-phone] Force registering phone without deregister: ${phoneNumberId}`);

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

    // Registration is idempotent for an already connected number. Never deregister it here.
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

    // Step 2: Register the phone number
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;

    const normalizedPin = String(pin || '').trim();
    // Meta's /register endpoint ALWAYS requires a `pin`. Omitting it makes the
    // Cloud API answer with the generic code 100 ("phone number not linked"),
    // which the UI used to surface as "número não está associado ao WABA".
    // When the caller does not provide one we fall back to the default 000000.
    const DEFAULT_PIN = '000000';
    const primaryPin = /^\d{6}$/.test(normalizedPin) ? normalizedPin : DEFAULT_PIN;

    const callRegister = async (pinValue: string) => {
      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin: pinValue })
      });
      return await res.json();
    };

    console.log(
      `[meta-register-phone] Calling register API for ${phoneNumberId} with ${primaryPin === DEFAULT_PIN ? 'default' : 'provided'} PIN${forceReregister ? ' (forced)' : ''}`
    );

    let registerData = await callRegister(primaryPin);
    console.log(`[meta-register-phone] Register response:`, JSON.stringify(registerData));

    // If the default PIN was rejected because 2FA is enabled with another PIN,
    // and the caller did supply a PIN, there is nothing else to try. Otherwise
    // retry once with the default PIN when a custom one failed.
    const pinErrorCodes = [133005, 136025];
    if (
      registerData?.error &&
      pinErrorCodes.includes(registerData.error.code) &&
      primaryPin !== DEFAULT_PIN
    ) {
      console.log('[meta-register-phone] Provided PIN rejected, retrying with default PIN');
      registerData = await callRegister(DEFAULT_PIN);
      console.log(`[meta-register-phone] Retry response:`, JSON.stringify(registerData));
    }


    let registerSuccess = false;
    let registerError = null;

    if (registerData.error) {
      const errorCode = registerData.error.code;
      const errorMessage = registerData.error.message || '';
      const errorSubcode = registerData.error.error_subcode;
      
      if (errorMessage.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered`);
        registerSuccess = true;
      } 
      else if (errorCode === 131031) {
        registerError = {
          code: errorCode,
          message: 'Conta bloqueada pela Meta (Business Account locked).',
          suggestion: 'Classificação: bloqueio/restrição da Meta no telefone ou Business Account. Confirme Business Verification, permissões do usuário, aprovação do nome comercial e avisos de restrição no WhatsApp Manager. Se persistir, solicite revisão à Meta.',
          details: registerData.error,
          blocked: true
        };
      }
      else if (errorCode === 136025 || errorSubcode === 136025) {
        registerError = {
          code: errorCode,
          message: 'PIN de verificação inválido.',
          requiresPin: true,
          suggestion: 'A Meta recusou a tentativa sem PIN ou com PIN inválido. Para números com verificação em duas etapas ativa, a própria Meta exige o PIN correto.'
        };
      }
      else if (errorCode === 133005) {
        // Two step verification PIN Mismatch
        registerError = {
          code: errorCode,
          message: 'PIN de verificação de dois fatores incorreto.',
          requiresPin: true,
          suggestion: 'A Meta informa que a verificação de dois fatores está ativa para este número. Sem o PIN correto, a Cloud API não conclui o registro.'
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

    if (registerError) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: registerError.message,
          code: registerError.code,
          suggestion: registerError.suggestion,
          requiresPin: registerError.requiresPin,
          blocked: registerError.blocked,
          status: initialStatus,
          details: registerError.details
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Webhook subscription is deliberately separate and must happen at WABA level.
    // Check final status after the registration request.
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
    if (finalStatus.status === 'PENDING' || finalStatus.status === 'DISCONNECTED') {
      return new Response(
        JSON.stringify({ 
          success: false,
          pending: true,
          status: finalStatus,
          message: finalStatus.status === 'DISCONNECTED' 
            ? 'Número está desconectado na Meta. A tentativa de conexão foi enviada, mas a Meta não confirmou.'
            : 'Número continua pendente. Isso geralmente significa que o número precisa de verificação no Meta.',
          suggestion: 'Classifique este número como pendente/restrito no Meta. Verifique Business Verification, nome comercial, permissões da WABA e avisos de restrição antes de repetir tentativas.',
          actions: [
            'Confirme se o número aparece dentro da WABA correta no WhatsApp Manager',
            'Conclua Business Verification e aprovação do nome comercial',
            'Se migrou de outro provedor, aguarde até 24h e evite remover/adicionar repetidamente'
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
