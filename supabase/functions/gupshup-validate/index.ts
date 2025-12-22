import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { apiKey, appName, sourcePhone } = await req.json();

    if (!apiKey || !appName) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key e App Name são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Validating Gupshup credentials for app:', appName);

    // Call Gupshup API to validate credentials
    // Using the wallet balance endpoint to verify API key is valid
    const gupshupResponse = await fetch(
      `https://api.gupshup.io/wa/app/${appName}`,
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Gupshup API response status:', gupshupResponse.status);

    if (gupshupResponse.status === 401) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas. Verifique sua API Key.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (gupshupResponse.status === 404) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'App não encontrado. Verifique o nome do app no Gupshup.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!gupshupResponse.ok) {
      const errorText = await gupshupResponse.text();
      console.error('Gupshup API error:', errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao validar credenciais com Gupshup' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appData = await gupshupResponse.json();
    console.log('Gupshup app data:', JSON.stringify(appData));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Credenciais validadas com sucesso!',
        appInfo: {
          name: appData.app?.name || appName,
          phone: appData.app?.phone || sourcePhone
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in gupshup-validate:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno ao validar credenciais' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
