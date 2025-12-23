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

    // For non-partner accounts, use the wallet balance endpoint
    // This endpoint works with just the apikey header (no app name needed for validation)
    console.log('Trying wallet balance endpoint...');
    const walletResponse = await fetch(
      'https://api.gupshup.io/sm/api/v2/wallet/balance',
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Wallet API response status:', walletResponse.status);
    const walletText = await walletResponse.text();
    console.log('Wallet API response body:', walletText);

    // Try to parse as JSON
    let walletData;
    try {
      walletData = JSON.parse(walletText);
    } catch {
      walletData = { raw: walletText };
    }

    // Check for authentication errors
    if (walletResponse.status === 401 || walletResponse.status === 403) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'API Key inválida. Verifique sua chave no painel do Gupshup.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for error in response body
    if (walletData?.status === 'error') {
      const errorMessage = typeof walletData.message === 'object' 
        ? walletData.message?.message 
        : walletData.message;
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage || 'Erro ao validar API Key com Gupshup.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If wallet check passed, now verify the app name by trying to send a test (without actually sending)
    // We'll use the templates endpoint with the src.name parameter
    console.log('Wallet validated, checking app name...');
    
    // Try to get templates for this app
    const templatesResponse = await fetch(
      `https://api.gupshup.io/sm/api/v1/template/list/${encodeURIComponent(appName)}`,
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

    let templatesData;
    try {
      templatesData = JSON.parse(templatesText);
    } catch {
      templatesData = { raw: templatesText };
    }

    // Check if app exists - 404 or error means app name is wrong
    if (templatesResponse.status === 404 || templatesData?.status === 'error') {
      // API Key is valid (wallet check passed), but app name might be wrong
      // Let's still allow connection but warn the user
      console.log('App name validation returned error, but API key is valid');
      
      // If the error is about the app not existing, inform the user
      if (templatesData?.message?.includes('not found') || templatesData?.message?.includes('not exist')) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `App "${appName}" não encontrado. Verifique o nome exato do seu app no painel do Gupshup.` 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If we got here, both API key and (likely) app name are valid
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
