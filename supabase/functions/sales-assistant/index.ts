import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication - REQUIRED
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('Invalid token or user not found:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    let agentConfig = null;

    // Fetch agent configuration for authenticated user
    const { data: agent } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    
    if (agent) {
      agentConfig = agent;
      console.log('Usando configurações do agente:', agent.name);
    }

    // Build dynamic system prompt based on agent config
    let systemPrompt = `Você é um assistente especialista em vendas e negociação, focado em ajudar atendentes a fechar vendas e lidar com objeções de clientes.`;

    if (agentConfig) {
      const styleMap: Record<string, string> = {
        consultivo: "consultivo, acolhedor e empático",
        neutro: "neutro, equilibrado e profissional",
        formal: "formal e institucional",
      };

      const profileMap: Record<string, string> = {
        vendedor: "vendedor focado em fechar negócios",
        sdr: "SDR focado em qualificar leads",
        suporte: "agente de suporte",
        onboarding: "especialista em onboarding",
        recepcionista: "recepcionista virtual",
        outro: "assistente virtual",
      };

      systemPrompt = `Você é ${agentConfig.name || "um assistente de vendas"}${agentConfig.nickname ? ` (${agentConfig.nickname})` : ""}, um ${profileMap[agentConfig.agent_profile] || "assistente de vendas"}.

Estilo de comunicação: ${styleMap[agentConfig.communication_style] || "profissional"}.

${agentConfig.objective ? `Objetivo principal: ${agentConfig.objective}` : ""}

${agentConfig.company_info ? `SOBRE A EMPRESA:\n${agentConfig.company_info}\n` : ""}

${agentConfig.products_services ? `PRODUTOS/SERVIÇOS:\n${agentConfig.products_services}\n` : ""}

${agentConfig.faq ? `PERGUNTAS FREQUENTES:\n${agentConfig.faq}\n` : ""}`;
    }

    systemPrompt += `

Suas responsabilidades como assistente de vendas:
1. Fornecer scripts de vendas persuasivos e naturais
2. Sugerir respostas para objeções comuns (preço alto, preciso pensar, etc.)
3. Dar dicas de técnicas de fechamento de vendas
4. Ajudar com abordagens de follow-up
5. Sugerir formas de criar urgência e valor

Diretrizes:
- Seja direto e prático nas respostas
- Use linguagem natural e conversacional (português brasileiro)
- Forneça exemplos de frases prontas para usar
- Adapte as sugestões ao contexto do cliente quando fornecido
- Mantenha respostas concisas mas completas
${agentConfig ? `- Use as informações da empresa para personalizar as respostas` : ""}

Formato das respostas:
- Para scripts: forneça a mensagem pronta entre aspas
- Para técnicas: explique brevemente e dê exemplo prático
- Para objeções: dê 2-3 opções de resposta`;

    console.log('Enviando mensagem para Lovable AI...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos de IA esgotados. Entre em contato com o suporte.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Erro da API: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua solicitação.';

    console.log('Resposta recebida com sucesso');

    return new Response(
      JSON.stringify({ message: aiMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro no sales-assistant:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
