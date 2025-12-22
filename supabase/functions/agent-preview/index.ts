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
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    const { message, agentConfig, conversationHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    // Build system prompt based on agent config
    const styleMap: Record<string, string> = {
      consultivo: "Seja consultivo, acolhedor e empático. Use linguagem amigável.",
      neutro: "Seja neutro, equilibrado e profissional.",
      formal: "Seja formal e institucional. Use linguagem polida.",
    };

    const profileMap: Record<string, string> = {
      vendedor: "Você é um vendedor focado em fechar negócios e apresentar valor.",
      sdr: "Você é um SDR focado em qualificar leads e agendar reuniões.",
      suporte: "Você é um agente de suporte focado em resolver problemas.",
      onboarding: "Você é um agente de onboarding focado em guiar novos clientes.",
      recepcionista: "Você é uma recepcionista virtual focada em direcionar atendimentos.",
      outro: "Você é um assistente virtual.",
    };

    const systemPrompt = `Você é ${agentConfig.name || "um assistente virtual"}${agentConfig.nickname ? ` (pode se apresentar como ${agentConfig.nickname})` : ""}.

${styleMap[agentConfig.communication_style] || styleMap.consultivo}
${profileMap[agentConfig.agent_profile] || profileMap.outro}

${agentConfig.objective ? `Seu objetivo: ${agentConfig.objective}` : ""}

${agentConfig.company_info ? `Informações sobre a empresa:\n${agentConfig.company_info}` : ""}

Diretrizes:
- Responda de forma natural e conversacional (português brasileiro)
- Seja conciso mas completo
- Mantenha o tom de comunicação definido
- Se não souber algo, seja honesto`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ];

    console.log('Gerando preview do agente...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro da API:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Erro da API: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || 'Sem resposta';

    console.log('Preview gerado com sucesso');

    return new Response(
      JSON.stringify({ message: aiMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro no agent-preview:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
