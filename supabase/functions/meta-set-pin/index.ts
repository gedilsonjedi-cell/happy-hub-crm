import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define/atualiza o PIN de verificação de dois fatores (2FA) do número WhatsApp Cloud API
// Doc: POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}  body: { pin: "######" }
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumberId, accessToken, pin } = await req.json();

    if (!phoneNumberId || !accessToken || !pin) {
      return new Response(
        JSON.stringify({ error: 'phoneNumberId, accessToken e pin são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!/^\d{6}$/.test(String(pin))) {
      return new Response(
        JSON.stringify({ error: 'O PIN precisa ter exatamente 6 dígitos numéricos.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[meta-set-pin] Definindo PIN 2FA do número ${phoneNumberId}`);

    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin: String(pin) }),
    });

    const data = await response.json();
    console.log(`[meta-set-pin] Resposta Meta:`, JSON.stringify(data));

    if (data.error) {
      let suggestion = 'Verifique no Meta Business Suite as configurações do número.';
      const code = data.error.code;
      if (code === 133006) {
        suggestion = 'Aguarde alguns minutos antes de tentar definir o PIN novamente (rate limit do Meta).';
      } else if (code === 190) {
        suggestion = 'Access Token inválido ou expirado.';
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: data.error.message || 'Falha ao definir o PIN',
          code,
          suggestion,
          details: data.error,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'PIN de verificação atualizado no Meta.', data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[meta-set-pin] Erro:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
