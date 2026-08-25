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

    console.log(`[meta-register-phone] Safely registering phone: ${phoneNumberId}`);

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

    // A PIN must come from the customer/Embedded Signup. A guessed default PIN can lock
    // a number and repeated deregister/register attempts can worsen Meta restrictions.
    if (!/^\d{6}$/.test(String(pin || ''))) {
      return new Response(
        JSON.stringify({
          success: false,
          requiresPin: true,
          error: 'Informe o PIN de 6 dígitos definido para este número na Meta.',
          suggestion: 'Não fazemos mais re-registro automático nem usamos PIN padrão. Informe o PIN correto para registrar com segurança.',
          status: initialStatus,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Register the phone number
    const registerUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    
    const registerPayload = {
      messaging_product: 'whatsapp',
      pin: String(pin)
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
      
      if (errorMessage.includes('already registered')) {
        console.log(`[meta-register-phone] Phone already registered`);
        registerSuccess = true;
      } 
      else if (errorCode === 131031) {
        registerError = {
          code: errorCode,
          message: 'Conta bloqueada pela Meta (Business Account locked).',
          suggestion: 'O PIN já consta como verificado, mas a Meta bloqueou a conta/número para registro. Acesse o WhatsApp Manager, conclua a verificação da empresa e a aprovação do nome comercial, procure avisos de restrição e solicite revisão. Forçar re-registro não resolve até a Meta liberar.',
          details: registerData.error,
          blocked: true
        };
      }
      else if (errorCode === 136025 || errorSubcode === 136025) {
        registerError = {
          code: errorCode,
          message: 'PIN de verificação inválido.',
          requiresPin: true,
          suggestion: 'Insira o PIN de 6 dígitos que foi definido na verificação de dois fatores do número no Meta Business Suite.'
        };
      }
      else if (errorCode === 133005) {
        // Two step verification PIN Mismatch
        registerError = {
          code: errorCode,
          message: 'PIN de verificação de dois fatores incorreto.',
          requiresPin: true,
          suggestion: 'O número possui verificação de dois fatores ativa. Acesse business.facebook.com > WhatsApp Manager > Configurações do telefone para obter ou redefinir o PIN de 6 dígitos.'
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
            ? 'Número está desconectado na Meta. Isso requer verificação de dois fatores (PIN).'
            : 'Número continua pendente. Isso geralmente significa que o número precisa de verificação no Meta.',
          suggestion: 'O número precisa de verificação de dois fatores (2FA). Acesse: business.facebook.com > WhatsApp Manager > Configurações do telefone > Insira o PIN de 6 dígitos correto ao reconectar.',
          actions: [
            'Obtenha o PIN de 6 dígitos da verificação de dois fatores no Meta Business Suite',
            'Insira o PIN correto no campo "PIN de verificação" ao clicar em "Forçar Reconexão"',
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
