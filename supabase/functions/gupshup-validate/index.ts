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
    // Using the settings endpoint which uses the apikey header correctly
    const gupshupResponse = await fetch(
      `https://api.gupshup.io/wa/app/${encodeURIComponent(appName)}/settings`,
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Gupshup API response status:', gupshupResponse.status);
    const responseText = await gupshupResponse.text();
    console.log('Gupshup API response body:', responseText);

    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    // Check for various error conditions
    if (gupshupResponse.status === 401 || gupshupResponse.status === 403) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas. Verifique sua API Key.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (gupshupResponse.status === 404) {
      // For 404, the app name might be wrong, but let's check the response
      if (responseData?.status === 'error' || responseData?.message) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: responseData.message || 'App não encontrado. Verifique o nome do app no Gupshup.' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // If we get a successful response or even a 404 with no error message,
    // try an alternative validation by attempting to get templates
    if (!gupshupResponse.ok) {
      // Try alternative endpoint - list templates
      console.log('Trying alternative validation endpoint...');
      const templatesResponse = await fetch(
        `https://api.gupshup.io/wa/app/${encodeURIComponent(appName)}/template`,
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

      if (templatesResponse.status === 401 || templatesResponse.status === 403) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Credenciais inválidas. Verifique sua API Key.' 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If templates endpoint also fails, credentials are likely wrong
      if (!templatesResponse.ok) {
        let templatesData;
        try {
          templatesData = JSON.parse(templatesText);
        } catch {
          templatesData = {};
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: templatesData?.message || 'Erro ao validar credenciais. Verifique o App Name e API Key.' 
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
