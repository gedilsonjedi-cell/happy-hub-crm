import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid pipeline stages (whitelist)
const VALID_STAGES = ["pre-atendimento", "vendas", "nao-finalizou", "follow-up", "cliente"];

const PIPELINE_STAGES: Record<string, string> = {
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

// Input validation
interface Message {
  role: string;
  content: string;
}

function validateInput(body: unknown): { valid: boolean; error?: string; data?: { messages: Message[]; leadId?: string; conversationId?: string } } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const { messages, leadId, conversationId } = body as Record<string, unknown>;

  // Validate messages
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'messages must be an array' };
  }

  if (messages.length === 0) {
    return { valid: false, error: 'messages cannot be empty' };
  }

  if (messages.length > 30) {
    return { valid: false, error: 'messages cannot exceed 30 items' };
  }

  const validRoles = ['user', 'assistant', 'system'];
  const validatedMessages: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `message at index ${i} is invalid` };
    }

    const m = msg as Record<string, unknown>;

    if (!m.role || typeof m.role !== 'string' || !validRoles.includes(m.role)) {
      return { valid: false, error: `message at index ${i} has invalid role` };
    }

    if (typeof m.content !== 'string') {
      return { valid: false, error: `message at index ${i} has invalid content` };
    }

    // Limit content length
    const content = m.content.trim().slice(0, 3000);
    if (content.length === 0 && m.role === 'user') {
      return { valid: false, error: `message at index ${i} has empty content` };
    }

    validatedMessages.push({
      role: m.role,
      content: content
    });
  }

  // Validate optional UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  let validatedLeadId: string | undefined;
  if (leadId !== undefined) {
    if (typeof leadId !== 'string' || !uuidRegex.test(leadId)) {
      return { valid: false, error: 'leadId must be a valid UUID' };
    }
    validatedLeadId = leadId;
  }

  let validatedConversationId: string | undefined;
  if (conversationId !== undefined) {
    if (typeof conversationId !== 'string' || !uuidRegex.test(conversationId)) {
      return { valid: false, error: 'conversationId must be a valid UUID' };
    }
    validatedConversationId = conversationId;
  }

  return {
    valid: true,
    data: {
      messages: validatedMessages,
      leadId: validatedLeadId,
      conversationId: validatedConversationId
    }
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication - REQUIRED
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.log("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log("Invalid token or user not found:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // Parse and validate input
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateInput(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, leadId, conversationId } = validation.data!;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    // Extract stage from response with whitelist validation
    const stageMatch = assistantMessage.match(/\[STAGE:([a-z-]+)\]/i);
    let detectedStage: string | null = stageMatch ? stageMatch[1].toLowerCase() : null;
    
    // Whitelist validation - reject invalid stages
    if (detectedStage && !VALID_STAGES.includes(detectedStage)) {
      console.warn("Invalid stage detected, ignoring:", detectedStage);
      detectedStage = null;
    }
    
    // Clean message (remove stage tag for display)
    const cleanMessage = assistantMessage.replace(/\[STAGE:[a-z-]+\]/gi, "").trim();

    console.log("Detected stage:", detectedStage);

    // Update lead's pipeline stage if we have a leadId and detected stage
    if (leadId && detectedStage && PIPELINE_STAGES[detectedStage]) {
      // First, get or create the stage
      const stageName = PIPELINE_STAGES[detectedStage];
      
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
        stageName: detectedStage ? PIPELINE_STAGES[detectedStage] : null
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
