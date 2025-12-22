import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Você é um assistente especialista em vendas e negociação, focado em ajudar atendentes a fechar vendas e lidar com objeções de clientes.

Suas responsabilidades:
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
- Use emojis com moderação para tornar as mensagens mais amigáveis

Formato das respostas:
- Para scripts: forneça a mensagem pronta entre aspas
- Para técnicas: explique brevemente e dê exemplo prático
- Para objeções: dê 2-3 opções de resposta`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

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
          { role: 'system', content: SYSTEM_PROMPT },
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
