import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Follow-up hours configuration (Brazil timezone UTC-3)
const FOLLOW_UP_HOURS = [8, 11, 14]; // 8h, 11h, 14h (will spread across attempts)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // External DB for whatsapp_messages
    const _extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const _extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const messageDb = (_extUrl && _extKey) ? createClient(_extUrl, _extKey) : supabase;

    const now = new Date();
    const brazilHour = (now.getUTCHours() - 3 + 24) % 24; // Brazil is UTC-3

    // Only run between 8h and 16h Brazil time
    if (brazilHour < 8 || brazilHour >= 16) {
      console.log(`Outside business hours (${brazilHour}h Brazil). Skipping.`);
      return new Response(
        JSON.stringify({ message: "Outside business hours", brazilHour }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find stalled sessions that need follow-up
    // - Status is active
    // - No activity for 24+ hours
    // - Less than 3 follow-ups sent
    // - Next follow-up time has passed (or is null for first follow-up)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: stalledSessions, error: sessionsError } = await supabase
      .from("flow_sessions")
      .select(`
        id,
        flow_bot_id,
        channel_id,
        contact_phone,
        current_node_id,
        collected_data,
        follow_up_count,
        last_activity_at,
        flow_bots!inner (
          id,
          name,
          organization_id,
          ai_fallback_message,
          transfer_message
        )
      `)
      .eq("status", "active")
      .lt("last_activity_at", twentyFourHoursAgo)
      .lt("follow_up_count", 3)
      .or(`next_follow_up_at.is.null,next_follow_up_at.lte.${now.toISOString()}`);

    if (sessionsError) {
      console.error("Error fetching stalled sessions:", sessionsError);
      throw sessionsError;
    }

    console.log(`Found ${stalledSessions?.length || 0} stalled sessions to follow-up`);

    if (!stalledSessions || stalledSessions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No stalled sessions found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const session of stalledSessions) {
      try {
        // Get the current node info to understand where they stopped
        const { data: currentNode } = await supabase
          .from("flow_nodes")
          .select("id, node_type, data")
          .eq("id", session.current_node_id)
          .maybeSingle();

        // Get channel info for sending
        const { data: channel } = await supabase
          .from("channels")
          .select("id, phone, access_token, provider, organization_id")
          .eq("id", session.channel_id)
          .single();

        if (!channel) {
          console.error(`Channel not found for session ${session.id}`);
          continue;
        }

        // Generate AI follow-up message based on context
        const followUpMessage = await generateFollowUpMessage(
          session,
          currentNode,
          session.follow_up_count
        );

        // Send the follow-up message
        const sendResult = await sendFollowUpMessage(
          supabase,
          channel,
          session.contact_phone,
          followUpMessage
        );

        if (sendResult.success) {
          // Calculate next follow-up time (different hour of day)
          const nextFollowUpAt = calculateNextFollowUpTime(session.follow_up_count + 1);

          // Update session with follow-up info
          await supabase
            .from("flow_sessions")
            .update({
              follow_up_count: session.follow_up_count + 1,
              last_follow_up_at: now.toISOString(),
              next_follow_up_at: session.follow_up_count + 1 >= 3 ? null : nextFollowUpAt.toISOString(),
            })
            .eq("id", session.id);

          // If this was the 3rd follow-up without response, mark session as abandoned
          if (session.follow_up_count + 1 >= 3) {
            await supabase
              .from("flow_sessions")
              .update({ status: "abandoned" })
              .eq("id", session.id);
          }

          processedCount++;
          console.log(`Follow-up ${session.follow_up_count + 1}/3 sent for session ${session.id}`);
        } else {
          errorCount++;
          console.error(`Failed to send follow-up for session ${session.id}:`, sendResult.error);
        }
      } catch (sessionError) {
        errorCount++;
        console.error(`Error processing session ${session.id}:`, sessionError);
      }
    }

    return new Response(
      JSON.stringify({
        message: "Follow-up processing complete",
        processed: processedCount,
        errors: errorCount,
        total: stalledSessions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Flow bot follow-up error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateFollowUpMessage(
  session: any,
  currentNode: any,
  followUpCount: number
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    // Fallback messages if AI is not available
    const fallbackMessages = [
      "Oi! Vi que você não conseguiu finalizar. Posso te ajudar com algo? 😊",
      "Olá! Ainda estou por aqui se precisar de alguma ajuda para continuar!",
      "Ei! Última chance de continuar de onde paramos. Posso ajudar? 🙋‍♂️",
    ];
    return fallbackMessages[followUpCount] || fallbackMessages[0];
  }

  // Build context for AI
  const nodeContext = currentNode ? 
    `O cliente parou no nó do tipo "${currentNode.node_type}" com o título "${(currentNode.data as any)?.label || 'sem título'}"` :
    "O cliente não avançou no fluxo";

  const collectedInfo = session.collected_data && Object.keys(session.collected_data).length > 0 ?
    `Informações já coletadas: ${JSON.stringify(session.collected_data)}` :
    "Nenhuma informação foi coletada ainda";

  const attemptContext = followUpCount === 0 ?
    "Esta é a primeira tentativa de follow-up (após 24h sem resposta)" :
    followUpCount === 1 ?
    "Esta é a segunda tentativa de follow-up" :
    "Esta é a terceira e última tentativa de follow-up - seja mais direto";

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente de vendas enviando mensagens de follow-up pelo WhatsApp.

CONTEXTO:
- Nome do fluxo: ${session.flow_bots?.name || "Fluxo de atendimento"}
- ${nodeContext}
- ${collectedInfo}
- ${attemptContext}

REGRAS:
1. Seja breve e amigável (máximo 2-3 frases)
2. NÃO repita perguntas já respondidas
3. Incentive o cliente a continuar o atendimento
4. Use emojis com moderação (1-2 máximo)
5. Adapte o tom baseado na tentativa:
   - 1ª: Amigável e curioso
   - 2ª: Prestativo, oferecendo ajuda
   - 3ª: Direto mas educado, última chance
6. NÃO inclua saudações formais como "Prezado" ou "Atenciosamente"
7. Escreva como uma mensagem casual de WhatsApp`,
          },
          {
            role: "user",
            content: "Gere uma mensagem de follow-up curta e eficaz para trazer o cliente de volta ao fluxo.",
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      throw new Error("AI API error");
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();
    
    return message || getFallbackMessage(followUpCount);
  } catch (error) {
    console.error("Error generating AI message:", error);
    return getFallbackMessage(followUpCount);
  }
}

function getFallbackMessage(followUpCount: number): string {
  const messages = [
    "Oi! Vi que você não conseguiu finalizar. Posso te ajudar com algo? 😊",
    "Olá! Ainda estou por aqui se precisar de alguma ajuda para continuar!",
    "Ei! Última chance de continuar de onde paramos. Posso ajudar? 🙋‍♂️",
  ];
  return messages[followUpCount] || messages[0];
}

function calculateNextFollowUpTime(nextFollowUpNumber: number): Date {
  const now = new Date();
  
  // Schedule for next day at a different hour
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Select hour based on attempt number (8h, 11h, 14h)
  const hour = FOLLOW_UP_HOURS[(nextFollowUpNumber - 1) % FOLLOW_UP_HOURS.length];
  
  // Convert to UTC (Brazil is UTC-3)
  tomorrow.setUTCHours(hour + 3, 0, 0, 0);
  
  return tomorrow;
}

async function sendFollowUpMessage(
  supabase: any,
  channel: any,
  contactPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (channel.provider === "meta") {
      // Send via Meta Cloud API
      const phoneNumberId = channel.phone;
      const accessToken = channel.access_token;

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: contactPhone,
            type: "text",
            text: { body: message },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: JSON.stringify(errorData) };
      }

      // Store the sent message on external DB
      await messageDb.from("whatsapp_messages").insert({
        channel_id: channel.id,
        organization_id: channel.organization_id,
        message_id: `followup_${Date.now()}`,
        sender_phone: channel.phone,
        sender_name: "Sistema",
        message_type: "text",
        content: message,
        direction: "outbound",
        status: "sent",
        metadata: { destination: contactPhone, provider: 'meta', follow_up: true },
      });
      return { success: true };
    } else if (channel.provider === "zapi") {
      // Z-API sending logic
      const instanceId = channel.phone;
      const token = channel.access_token;

      const response = await fetch(
        `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: contactPhone,
            message: message,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: JSON.stringify(errorData) };
      }

      // Store the sent message on external DB
      await messageDb.from("whatsapp_messages").insert({
        channel_id: channel.id,
        organization_id: channel.organization_id,
        message_id: `followup_${Date.now()}`,
        sender_phone: channel.phone,
        sender_name: "Sistema",
        message_type: "text",
        content: message,
        direction: "outbound",
        status: "sent",
        metadata: { destination: contactPhone, provider: 'zapi', follow_up: true },
      });
      return { success: true };
    }

    return { success: false, error: "Unknown channel provider" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
