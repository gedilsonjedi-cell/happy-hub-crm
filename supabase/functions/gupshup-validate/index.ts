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

    // Use the templates list endpoint to validate credentials
    // This endpoint is documented and should work with the apikey header
    const templatesResponse = await fetch(
      `https://api.gupshup.io/wa/app/${encodeURIComponent(appName)}/template/list`,
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Templates API response status:', templatesResponse.status);
    const templatesText = await templatesResponse.text();
    console.log('Templates API response body:', templatesText);

    // Try to parse as JSON
    let templatesData;
    try {
      templatesData = JSON.parse(templatesText);
    } catch {
      templatesData = { raw: templatesText };
    }

    // Check for authentication errors
    if (templatesResponse.status === 401 || templatesResponse.status === 403) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas. Verifique sua API Key.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for app not found
    if (templatesResponse.status === 404) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'App não encontrado. Verifique o nome do app no Gupshup.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for error in response body
    if (templatesData?.status === 'error') {
      const errorMessage = typeof templatesData.message === 'object' 
        ? templatesData.message?.message 
        : templatesData.message;
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage || 'Erro ao validar credenciais com Gupshup.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we get here with any other non-success status, try wallet balance endpoint
    if (!templatesResponse.ok) {
      console.log('Templates endpoint failed, trying wallet balance...');
      
      const walletResponse = await fetch(
        `https://api.gupshup.io/wa/app/${encodeURIComponent(appName)}/wallet/balance`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Wallet API response status:', walletResponse.status);
      
      if (walletResponse.status === 401 || walletResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Credenciais inválidas. Verifique sua API Key.' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!walletResponse.ok) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Erro ao validar credenciais. Verifique o App Name e API Key.' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Credentials validated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Credenciais validadas com sucesso!',
        appInfo: {
          name: appName,
          phone: sourcePhone
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
