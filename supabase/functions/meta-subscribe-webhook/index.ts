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
    const { phoneNumberId, accessToken } = await req.json();

    console.log(`[meta-subscribe-webhook] Subscribing phone: ${phoneNumberId}`);

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

    // Subscribe phone number to webhook
    const subscribeUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/subscribed_apps`;
    
    console.log(`[meta-subscribe-webhook] Calling subscribe API...`);
    
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });

    const subscribeData = await subscribeResponse.json();
    console.log(`[meta-subscribe-webhook] Subscribe response:`, JSON.stringify(subscribeData));

    if (subscribeData.error) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: subscribeData.error.message || 'Erro ao inscrever no webhook',
          code: subscribeData.error.code,
          details: subscribeData.error
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: subscribeData.success === true,
        message: subscribeData.success ? 'Número inscrito no webhook com sucesso!' : 'Resposta inesperada da API',
        data: subscribeData
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[meta-subscribe-webhook] Error:', error);
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
