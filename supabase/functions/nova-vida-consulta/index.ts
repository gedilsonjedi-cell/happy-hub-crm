import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Price per query in BRL
const PRICE_PER_QUERY = 0.04;

// Cache for the token (valid for 24 hours)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 1 hour buffer) and not forcing refresh
  if (!forceRefresh && cachedToken && tokenExpiry > now + 3600000) {
    console.log('Using cached token');
    return cachedToken;
  }

  console.log('Generating new token...');
  
  const usuario = Deno.env.get('NOVA_VIDA_USUARIO');
  const senha = Deno.env.get('NOVA_VIDA_SENHA');
  const cliente = Deno.env.get('NOVA_VIDA_CLIENTE');

  if (!usuario || !senha || !cliente) {
    throw new Error('Credenciais Nova Vida TI não configuradas');
  }

  const response = await fetch('https://wsnv.novavidati.com.br/wslocalizador.asmx/GerarTokenJson', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      credencial: {
        usuario,
        senha,
        cliente,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao gerar token: ${response.status}`);
  }

  const tokenData = await response.text();
  cachedToken = tokenData.replace(/"/g, '').trim();
  tokenExpiry = now + 24 * 60 * 60 * 1000; // 24 hours
  
  console.log('New token generated successfully');
  return cachedToken;
}

async function queryNVCHECK(documento: string, token: string): Promise<any> {
  const response = await fetch('https://wsnv.novavidati.com.br/wslocalizador.asmx/NVCHECKJson', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Token': token,
    },
    body: JSON.stringify({
      nvcheck: {
        Documento: documento,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro na consulta: ${response.status}`);
  }

  const result = await response.json();
  
  // Check if token expired in the response
  if (result?.d === "TOKEN EXPIRADO." || result?.d?.includes?.("TOKEN EXPIRADO")) {
    throw new Error('TOKEN_EXPIRED');
  }
  
  // Check if result is valid (has CONSULTA data)
  if (typeof result?.d === 'string' && !result?.d?.CONSULTA) {
    throw new Error(`Resposta inválida da API: ${result.d}`);
  }

  return result;
}

async function queryWithRetry(documento: string, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Force refresh token on retry
      const token = await getToken(attempt > 0);
      const result = await queryNVCHECK(documento, token);
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      lastError = error;
      
      // If token expired, force refresh and retry
      if (error.message === 'TOKEN_EXPIRED') {
        console.log(`Token expired, retrying (attempt ${attempt + 1})...`);
        cachedToken = null; // Clear cached token
        tokenExpiry = 0;
        continue;
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw lastError || new Error('Falha após múltiplas tentativas');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: 'Organização não encontrada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = profile.organization_id;

    const { documento, documentos } = await req.json();

    // Handle single query
    if (documento) {
      // Check balance first
      const { data: balanceData } = await supabase
        .from('organization_balance')
        .select('balance')
        .eq('organization_id', organizationId)
        .single();

      const currentBalance = balanceData?.balance || 0;
      
      if (currentBalance < PRICE_PER_QUERY) {
        return new Response(
          JSON.stringify({ error: 'Saldo insuficiente', required: PRICE_PER_QUERY, current: currentBalance }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Query with retry logic (handles token expiration)
      let result;
      try {
        result = await queryWithRetry(documento);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error('Query error:', errorMessage);
        return new Response(
          JSON.stringify({ error: `Erro na consulta: ${errorMessage}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Only debit AFTER successful query
      const newBalance = currentBalance - PRICE_PER_QUERY;
      
      // Use debit function for atomic operation
      const { error: debitError } = await supabase.rpc('debit_organization_balance', {
        _organization_id: organizationId,
        _amount: PRICE_PER_QUERY,
        _description: `Consulta Nova Vida TI - ${documento}`,
        _reference_type: 'nova_vida_consulta',
        _reference_id: documento
      });

      if (debitError) {
        console.error('Debit error:', debitError);
        // Still return the result since the query was successful
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: result, 
          cost: PRICE_PER_QUERY,
          newBalance: newBalance 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle batch query
    if (documentos && Array.isArray(documentos)) {
      const totalCost = documentos.length * PRICE_PER_QUERY;

      // Check balance
      const { data: balanceData } = await supabase
        .from('organization_balance')
        .select('balance')
        .eq('organization_id', organizationId)
        .single();

      const currentBalance = balanceData?.balance || 0;
      
      if (currentBalance < totalCost) {
        return new Response(
          JSON.stringify({ 
            error: 'Saldo insuficiente', 
            required: totalCost, 
            current: currentBalance,
            maxQueries: Math.floor(currentBalance / PRICE_PER_QUERY)
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process all queries with retry logic
      const results = [];
      let successCount = 0;
      
      for (const doc of documentos) {
        try {
          const result = await queryWithRetry(doc);
          results.push({ documento: doc, success: true, data: result });
          successCount++;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
          results.push({ documento: doc, success: false, error: errorMessage });
        }
      }

      // Only charge for successful queries
      const actualCost = successCount * PRICE_PER_QUERY;
      
      if (successCount > 0) {
        // Use debit function for atomic operation
        await supabase.rpc('debit_organization_balance', {
          _organization_id: organizationId,
          _amount: actualCost,
          _description: `Consulta em lote Nova Vida TI - ${successCount} documentos`,
          _reference_type: 'nova_vida_consulta_lote',
          _reference_id: null
        });
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          results, 
          totalCost: actualCost,
          successCount,
          failedCount: documentos.length - successCount,
          newBalance: currentBalance - actualCost
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Documento ou documentos não fornecidos' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    console.error('Erro na consulta Nova Vida TI:', err);
    const errorMessage = err instanceof Error ? err.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
