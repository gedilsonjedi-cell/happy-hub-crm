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
    const { phoneNumberId, accessToken, wabaId } = await req.json();

    console.log(`[meta-subscribe-webhook] Subscribing WABA: ${wabaId || 'not provided'}, Phone: ${phoneNumberId}`);

    if (!accessToken) {
      return new Response(
        JSON.stringify({ 
          error: 'Access Token é obrigatório'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If WABA ID is provided, subscribe at WABA level (recommended)
    // Otherwise, try to subscribe the phone number to the app
    let subscribeUrl: string;
    let subscribeBody: Record<string, unknown>;

    if (wabaId) {
      // Subscribe at WABA level - this enables webhooks for all phone numbers in the WABA
      subscribeUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
      subscribeBody = {};
      console.log(`[meta-subscribe-webhook] Using WABA-level subscription: ${subscribeUrl}`);
    } else if (phoneNumberId) {
      // Alternative: Register the phone number for messaging
      // This ensures the phone number is properly set up for the Cloud API
      subscribeUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
      subscribeBody = {
        messaging_product: 'whatsapp',
        pin: '123456' // Default PIN
      };
      console.log(`[meta-subscribe-webhook] Using phone registration: ${subscribeUrl}`);
    } else {
      return new Response(
        JSON.stringify({ 
          error: 'WABA ID ou Phone Number ID é obrigatório'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`[meta-subscribe-webhook] Calling API: ${subscribeUrl}`);
    
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscribeBody)
    });

    const subscribeData = await subscribeResponse.json();
    console.log(`[meta-subscribe-webhook] Response:`, JSON.stringify(subscribeData));

    if (subscribeData.error) {
      // Check if it's already registered error (which is fine)
      if (subscribeData.error.code === 131000 || 
          subscribeData.error.message?.includes('already registered')) {
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Número já está registrado e inscrito',
            alreadyRegistered: true
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

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
        success: subscribeData.success === true || subscribeData.success === undefined,
        message: 'Webhook inscrito com sucesso!',
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
