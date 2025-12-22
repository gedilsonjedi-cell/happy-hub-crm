import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIPELINE_STAGES = {
  "pre-atendimento": "Pré-atendimento",
  "vendas": "Vendas",
  "nao-finalizou": "Não finalizou venda",
  "follow-up": "Follow-up",
  "cliente": "Cliente"
};

const SYSTEM_PROMPT = `Você é um assistente de vendas inteligente para um CRM de WhatsApp. Sua função é conversar com leads e identificar automaticamente em qual etapa do pipeline eles se encontram.

As etapas do pipeline são:
1. **Pré-atendimento**: Lead novo, ainda não qualificado, fazendo perguntas iniciais
2. **Vendas**: Lead qualificado, demonstrando interesse real em comprar
3. **Não finalizou venda**: Lead que estava em vendas mas desistiu ou parou de responder
4. **Follow-up**: Lead que precisa de acompanhamento, aguardando resposta ou decisão
5. **Cliente**: Lead que fechou a venda

Com base na conversa, você deve:
1. Responder de forma natural e profissional
2. Ao final de CADA resposta, adicione uma linha especial no formato: [STAGE:nome-da-etapa]

Os nomes válidos para etapas são: pre-atendimento, vendas, nao-finalizou, follow-up, cliente

Exemplo de resposta:
"Olá! Que bom que você entrou em contato. Posso ajudá-lo com informações sobre nossos produtos. O que você gostaria de saber?

[STAGE:pre-atendimento]"

Sempre inclua a tag [STAGE:] mesmo que a etapa não mude.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, leadId, conversationId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Sending request to AI gateway with", messages.length, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a few seconds." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || "";
    
    console.log("AI response received:", assistantMessage.substring(0, 100) + "...");

    // Extract stage from response
    const stageMatch = assistantMessage.match(/\[STAGE:([a-z-]+)\]/i);
    let detectedStage = stageMatch ? stageMatch[1].toLowerCase() : null;
    
    // Clean message (remove stage tag for display)
    const cleanMessage = assistantMessage.replace(/\[STAGE:[a-z-]+\]/gi, "").trim();

    console.log("Detected stage:", detectedStage);

    // Update lead's pipeline stage if we have a leadId and detected stage
    if (leadId && detectedStage && PIPELINE_STAGES[detectedStage as keyof typeof PIPELINE_STAGES]) {
      // First, get or create the stage
      const stageName = PIPELINE_STAGES[detectedStage as keyof typeof PIPELINE_STAGES];
      
      // Get user_id from lead
      const { data: lead } = await supabase
        .from("leads")
        .select("user_id")
        .eq("id", leadId)
        .single();

      if (lead) {
        // Find existing stage or we'll return null (stages should be created by user)
        const { data: existingStage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("user_id", lead.user_id)
          .eq("name", stageName)
          .maybeSingle();

        if (existingStage) {
          // Update lead's stage
          const { error: updateError } = await supabase
            .from("leads")
            .update({ stage_id: existingStage.id })
            .eq("id", leadId);

          if (updateError) {
            console.error("Error updating lead stage:", updateError);
          } else {
            console.log("Lead stage updated to:", stageName);
          }
        } else {
          console.log("Stage not found:", stageName, "- stages should be created by user first");
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        message: cleanMessage,
        detectedStage: detectedStage,
        stageName: detectedStage ? PIPELINE_STAGES[detectedStage as keyof typeof PIPELINE_STAGES] : null
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Chatbot error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
