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

async function getToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 1 hour buffer)
  if (cachedToken && tokenExpiry > now + 3600000) {
    return cachedToken;
  }

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

  return await response.json();
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
      // Check balance
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

      // Get token and query
      const token = await getToken();
      const result = await queryNVCHECK(documento, token);

      // Debit balance
      const newBalance = currentBalance - PRICE_PER_QUERY;
      await supabase
        .from('organization_balance')
        .update({ 
          balance: newBalance,
          total_spent: supabase.rpc('increment', { x: PRICE_PER_QUERY }),
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', organizationId);

      // Record transaction
      await supabase
        .from('balance_transactions')
        .insert({
          organization_id: organizationId,
          type: 'debit',
          amount: PRICE_PER_QUERY,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Consulta Nova Vida TI - ${documento}`,
          reference_type: 'nova_vida_consulta',
          created_by: user.id,
        });

      return new Response(
        JSON.stringify({ success: true, data: result, cost: PRICE_PER_QUERY }),
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

      // Get token
      const token = await getToken();
      
      // Process all queries
      const results = [];
      let successCount = 0;
      
      for (const doc of documentos) {
        try {
          const result = await queryNVCHECK(doc, token);
          results.push({ documento: doc, success: true, data: result });
          successCount++;
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
          results.push({ documento: doc, success: false, error: errorMessage });
        }
      }

      // Calculate actual cost (only successful queries)
      const actualCost = successCount * PRICE_PER_QUERY;
      const newBalance = currentBalance - actualCost;

      // Debit balance
      await supabase
        .from('organization_balance')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', organizationId);

      // Record transaction
      await supabase
        .from('balance_transactions')
        .insert({
          organization_id: organizationId,
          type: 'debit',
          amount: actualCost,
          balance_before: currentBalance,
          balance_after: newBalance,
          description: `Consulta em lote Nova Vida TI - ${successCount} documentos`,
          reference_type: 'nova_vida_consulta_lote',
          created_by: user.id,
        });

      return new Response(
        JSON.stringify({ 
          success: true, 
          results, 
          totalCost: actualCost,
          successCount,
          failedCount: documentos.length - successCount
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
