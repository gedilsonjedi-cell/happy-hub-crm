import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation
interface Message {
  role: string;
  content: string;
}

interface AgentConfig {
  name?: string;
  nickname?: string;
  communication_style?: string;
  agent_profile?: string;
  objective?: string;
  company_info?: string;
  service_guide_enabled?: boolean;
  service_guide?: string;
}

function validateInput(body: unknown): { valid: boolean; error?: string; data?: { message: string; agentConfig: AgentConfig; conversationHistory: Message[] } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const { message, agentConfig, conversationHistory } = body as Record<string, unknown>;

  // Validate message
  if (typeof message !== 'string' || message.trim().length === 0) {
    return { valid: false, error: 'message must be a non-empty string' };
  }

  if (message.length > 5000) {
    return { valid: false, error: 'message cannot exceed 5000 characters' };
  }

  // Validate agentConfig
  if (!agentConfig || typeof agentConfig !== 'object') {
    return { valid: false, error: 'agentConfig must be an object' };
  }

  const config = agentConfig as Record<string, unknown>;
  const validatedConfig: AgentConfig = {
    name: typeof config.name === 'string' ? config.name.slice(0, 100) : undefined,
    nickname: typeof config.nickname === 'string' ? config.nickname.slice(0, 50) : undefined,
    communication_style: typeof config.communication_style === 'string' ? config.communication_style.slice(0, 50) : undefined,
    agent_profile: typeof config.agent_profile === 'string' ? config.agent_profile.slice(0, 50) : undefined,
    objective: typeof config.objective === 'string' ? config.objective.slice(0, 500) : undefined,
    company_info: typeof config.company_info === 'string' ? config.company_info.slice(0, 2000) : undefined,
    service_guide_enabled: typeof config.service_guide_enabled === 'boolean' ? config.service_guide_enabled : false,
    service_guide: typeof config.service_guide === 'string' ? config.service_guide.slice(0, 5000) : undefined,
  };

  // Validate conversationHistory
  if (!Array.isArray(conversationHistory)) {
    return { valid: false, error: 'conversationHistory must be an array' };
  }

  if (conversationHistory.length > 20) {
    return { valid: false, error: 'conversationHistory cannot exceed 20 messages' };
  }

  const validRoles = ['user', 'assistant'];
  const validatedHistory: Message[] = [];

  for (let i = 0; i < conversationHistory.length; i++) {
    const msg = conversationHistory[i];
    
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `conversationHistory[${i}] is invalid` };
    }

    const m = msg as Record<string, unknown>;
    
    if (!m.role || typeof m.role !== 'string' || !validRoles.includes(m.role)) {
      return { valid: false, error: `conversationHistory[${i}] has invalid role` };
    }

    if (typeof m.content !== 'string') {
      return { valid: false, error: `conversationHistory[${i}] has invalid content` };
    }

    validatedHistory.push({
      role: m.role,
      content: m.content.slice(0, 2000)
    });
  }

  return {
    valid: true,
    data: {
      message: message.trim().slice(0, 5000),
      agentConfig: validatedConfig,
      conversationHistory: validatedHistory
    }
  };
}

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

    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validation = validateInput(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, agentConfig, conversationHistory } = validation.data!;
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

    // Check if service guide is enabled
    const hasServiceGuide = agentConfig.service_guide_enabled && agentConfig.service_guide;

    const systemPrompt = `Você é ${agentConfig.name || "um assistente virtual"}${agentConfig.nickname ? ` (pode se apresentar como ${agentConfig.nickname})` : ""}.

${styleMap[agentConfig.communication_style || ''] || styleMap.consultivo}
${profileMap[agentConfig.agent_profile || ''] || profileMap.outro}

${agentConfig.objective ? `Seu objetivo: ${agentConfig.objective}` : ""}

${agentConfig.company_info ? `Informações sobre a empresa:\n${agentConfig.company_info}` : ""}

${hasServiceGuide ? `## GUIA DE ATENDIMENTO (SIGA ESTE ROTEIRO)
${agentConfig.service_guide}

### INSTRUÇÕES DO GUIA
- Você DEVE seguir o roteiro acima de forma estruturada durante o atendimento
- Conduza a conversa passo a passo conforme descrito no guia
- Se o cliente fizer perguntas fora do script, responda brevemente e volte ao roteiro
- Adapte a linguagem ao seu estilo de comunicação, mas mantenha a estrutura do roteiro
- Seu objetivo é completar todas as etapas do guia para um atendimento de qualidade
` : ''}
Diretrizes:
- Responda de forma natural e conversacional (português brasileiro)
- Seja conciso mas completo
- Mantenha o tom de comunicação definido
- Se não souber algo, seja honesto`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
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
