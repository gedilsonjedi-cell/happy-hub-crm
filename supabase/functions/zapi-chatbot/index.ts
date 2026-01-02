import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatbotConfig {
  is_enabled: boolean;
  auto_reply_when_unavailable: boolean;
  welcome_message: string;
  transfer_message: string;
  away_message: string;
  qualification_keywords: string[];
  auto_qualify_enabled: boolean;
  initial_stage_id: string | null;
  qualified_stage_id: string | null;
  agent_id: string | null;
}

interface AIAgent {
  id: string;
  name: string;
  agent_profile: string | null;
  communication_style: string | null;
  objective: string | null;
  company_info: string | null;
  products_services: string | null;
  faq: string | null;
  service_guide_enabled: boolean | null;
  service_guide: string | null;
  nickname: string | null;
  sign_conversations: boolean | null;
}

// Cache for processed message IDs to prevent duplicates
const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_TTL = 60000; // 1 minute TTL

function isMessageProcessed(messageId: string): boolean {
  const now = Date.now();
  
  // Clean old entries
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_CACHE_TTL) {
      processedMessages.delete(key);
    }
  }
  
  if (processedMessages.has(messageId)) {
    return true;
  }
  
  processedMessages.set(messageId, now);
  return false;
}

// Helper function to send WhatsApp message via Z-API
async function sendZApiMessage(instanceId: string, token: string, recipientPhone: string, message: string, clientToken?: string): Promise<boolean> {
  try {
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    
    console.log('Sending Z-API message to:', cleanPhone);
    console.log('Instance ID:', instanceId);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add client-token header if provided
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: cleanPhone,
        message: message
      }),
    });

    const responseText = await response.text();
    console.log('Z-API response status:', response.status);
    console.log('Z-API response body:', responseText);

    if (!response.ok) {
      console.error('Error sending Z-API message:', responseText);
      return false;
    }

    console.log('Z-API message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending Z-API message:', error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      channelId, 
      senderPhone, 
      senderName,
      messageContent,
      messageId,
      organizationId,
      instanceId,
      token,
      campaignChatbotId
    } = await req.json();

    console.log('Z-API Chatbot processing message:', { channelId, senderPhone, messageContent, messageId });

    // Check for duplicate message processing
    if (messageId && isMessageProcessed(messageId)) {
      console.log('Message already processed, skipping:', messageId);
      return new Response(
        JSON.stringify({ handled: false, reason: 'Duplicate message' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if we already RESPONDED to this message (look for bot outbound message after this one)
    if (messageId) {
      const { data: botResponse } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('channel_id', channelId)
        .eq('direction', 'outbound')
        .contains('metadata', { is_bot: true })
        .gt('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute
        .limit(1);
      
      // Check if there's a recent bot response for this conversation
      const { data: recentBotMessages } = await supabase
        .from('whatsapp_messages')
        .select('id, created_at')
        .eq('channel_id', channelId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1);
      
      const { data: inboundMessage } = await supabase
        .from('whatsapp_messages')
        .select('id, created_at')
        .eq('message_id', messageId)
        .single();
      
      // If we found the inbound message and there's a bot response after it, skip
      if (inboundMessage && recentBotMessages?.[0]) {
        const inboundTime = new Date(inboundMessage.created_at).getTime();
        const botTime = new Date(recentBotMessages[0].created_at).getTime();
        if (botTime > inboundTime) {
          console.log('Already responded to this message, skipping:', messageId);
          return new Response(
            JSON.stringify({ handled: false, reason: 'Already responded' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Get chatbot config for this channel
    const { data: config } = await supabase
      .from('chatbot_config')
      .select('*')
      .eq('channel_id', channelId)
      .eq('is_enabled', true)
      .single();

    if (!config) {
      console.log('No chatbot config found or chatbot disabled');
      return new Response(
        JSON.stringify({ handled: false, reason: 'Chatbot disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chatbotConfig = config as ChatbotConfig;

    // Check or create conversation assignment
    let { data: assignment } = await supabase
      .from('conversation_assignments')
      .select('*, campaign_chatbot_id')
      .eq('conversation_phone', senderPhone)
      .eq('channel_id', channelId)
      .single();

    const isNewConversation = !assignment;

    if (!assignment) {
      const { data: newAssignment, error: assignError } = await supabase
        .from('conversation_assignments')
        .insert({
          conversation_phone: senderPhone,
          channel_id: channelId,
          is_bot_handling: true,
          status: 'pending'
        })
        .select('*, campaign_chatbot_id')
        .single();

      if (assignError) {
        console.error('Error creating assignment:', assignError);
      }
      assignment = newAssignment;
    }

    // Determine which agent to use
    let agentToUse: AIAgent | null = null;
    const agentIdToUse = campaignChatbotId || assignment?.campaign_chatbot_id || chatbotConfig.agent_id;

    if (agentIdToUse) {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('id, name, agent_profile, communication_style, objective, company_info, products_services, faq, service_guide_enabled, service_guide, nickname, sign_conversations')
        .eq('id', agentIdToUse)
        .eq('is_active', true)
        .single();

      if (agent) {
        agentToUse = agent;
        console.log('Using AI agent:', agent.name);
      }
    }

    // Check if a human is handling this conversation
    if (assignment && !assignment.is_bot_handling && assignment.assigned_to) {
      console.log('Human is handling this conversation');
      return new Response(
        JSON.stringify({ handled: false, reason: 'Human handling' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find or create lead
    let leadId = assignment?.lead_id;
    if (!leadId) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', senderPhone)
        .eq('organization_id', organizationId)
        .single();

      leadId = existingLead?.id;

      if (leadId && assignment) {
        await supabase
          .from('conversation_assignments')
          .update({ lead_id: leadId })
          .eq('id', assignment.id);
      }
    }

    // Check for qualification keywords
    let shouldQualify = false;
    if (chatbotConfig.auto_qualify_enabled && chatbotConfig.qualification_keywords) {
      const lowerMessage = messageContent.toLowerCase();
      shouldQualify = chatbotConfig.qualification_keywords.some(
        (keyword: string) => lowerMessage.includes(keyword.toLowerCase())
      );
    }

    // Update lead stage if qualified
    if (shouldQualify && leadId && chatbotConfig.qualified_stage_id) {
      await supabase
        .from('leads')
        .update({ stage_id: chatbotConfig.qualified_stage_id })
        .eq('id', leadId);
      
      console.log('Lead qualified and moved to stage:', chatbotConfig.qualified_stage_id);
    }

    // Check for available attendants
    const { data: availableAttendants } = await supabase
      .from('attendant_availability')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_available', true)
      .lt('current_conversations', 5)
      .order('last_assignment_at', { ascending: true, nullsFirst: true })
      .limit(1);

    let responseMessage = '';
    let shouldTransfer = false;

    if (availableAttendants && availableAttendants.length > 0) {
      const attendant = availableAttendants[0];
      
      // Assign to attendant
      await supabase
        .from('conversation_assignments')
        .update({
          assigned_to: attendant.user_id,
          assigned_at: new Date().toISOString(),
          is_bot_handling: false,
          status: 'assigned'
        })
        .eq('id', assignment?.id);

      // Update attendant stats
      await supabase
        .from('attendant_availability')
        .update({
          current_conversations: attendant.current_conversations + 1,
          last_assignment_at: new Date().toISOString()
        })
        .eq('id', attendant.id);

      // Move lead to "Qualificação" stage when transferred to human attendant
      if (leadId) {
        const { data: qualificacaoStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', '%qualificação%')
          .limit(1)
          .single();
        
        if (qualificacaoStage) {
          await supabase
            .from('leads')
            .update({ stage_id: qualificacaoStage.id })
            .eq('id', leadId);
          
          console.log('Lead moved to Qualificação stage after transfer');
        }
      }

      responseMessage = chatbotConfig.transfer_message || 'Um atendente irá atendê-lo em breve!';
      shouldTransfer = true;
      console.log('Conversation transferred to attendant:', attendant.user_id);
    } else {
      // No attendants available - bot handles with AI
      // Generate AI response (for ALL messages, not just new conversations)
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
      if (LOVABLE_API_KEY) {
        try {
          // Get conversation history - fetch all messages for this contact
          // Inbound: sender_phone is the customer
          // Outbound: metadata->destination is the customer (without +)
          const customerPhoneClean = senderPhone.replace(/\D/g, '');
          
          const { data: history } = await supabase
            .from('whatsapp_messages')
            .select('content, direction, created_at, sender_phone, metadata')
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(50);
          
          // Filter to only messages for THIS conversation
          const conversationHistory = (history || []).filter(msg => {
            if (msg.direction === 'inbound') {
              // Inbound: check if sender matches customer
              const msgPhone = (msg.sender_phone || '').replace(/\D/g, '');
              return msgPhone === customerPhoneClean || msgPhone.endsWith(customerPhoneClean.slice(-9));
            } else {
              // Outbound: check if destination matches customer
              const destination = ((msg.metadata as any)?.destination || '').replace(/\D/g, '');
              return destination === customerPhoneClean || destination.endsWith(customerPhoneClean.slice(-9));
            }
          });
          
          console.log('Conversation history found:', conversationHistory.length, 'messages for phone:', customerPhoneClean);

          // Determine if this is the first message (no previous bot messages)
          const hasPreviousBotMessages = conversationHistory.some(msg => msg.direction === 'outbound');

          // Build system prompt based on agent configuration
          let systemPrompt = `Você é um assistente virtual de atendimento ao cliente via WhatsApp. 
Seja cordial, objetivo e útil. Mantenha respostas curtas (máximo 2-3 frases).
Se o cliente perguntar sobre preços, produtos ou quiser falar com um humano, informe que irá transferir para um atendente.
Não invente informações sobre produtos ou preços específicos.

## IMPORTANTE - Regras de Saudação
${hasPreviousBotMessages ? '- Esta conversa já está em andamento. NÃO se apresente novamente. NÃO diga "olá" ou "oi" novamente. Continue a conversa de forma natural, respondendo diretamente à pergunta/mensagem do cliente.' : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente.'}`;

          if (agentToUse) {
            const hasServiceGuide = agentToUse.service_guide_enabled && agentToUse.service_guide;
            
            systemPrompt = `Você é ${agentToUse.name}, um assistente virtual de atendimento ao cliente via WhatsApp.

${agentToUse.agent_profile ? `## Perfil\n${agentToUse.agent_profile}\n` : ''}
${agentToUse.communication_style ? `## Estilo de Comunicação\n${agentToUse.communication_style}\n` : ''}
${agentToUse.objective ? `## Objetivo\n${agentToUse.objective}\n` : ''}
${agentToUse.company_info ? `## Sobre a Empresa\n${agentToUse.company_info}\n` : ''}
${agentToUse.products_services ? `## Produtos e Serviços\n${agentToUse.products_services}\n` : ''}
${agentToUse.faq ? `## FAQ\n${agentToUse.faq}\n` : ''}
${hasServiceGuide ? `## GUIA DE ATENDIMENTO (SIGA ESTE ROTEIRO)
${agentToUse.service_guide}

### INSTRUÇÕES DO GUIA
- Você DEVE seguir o roteiro acima de forma estruturada durante o atendimento
- Conduza a conversa passo a passo conforme descrito no guia
- Se o cliente fizer perguntas fora do script, responda brevemente e volte ao roteiro
- Adapte a linguagem ao seu estilo de comunicação, mas mantenha a estrutura do roteiro
- Seu objetivo é completar todas as etapas do guia para um atendimento de qualidade
` : ''}
## IMPORTANTE - Regras de Saudação e Continuidade
${hasPreviousBotMessages ? `- Esta conversa já está em andamento. NÃO se apresente novamente. 
- NÃO diga "olá", "oi", "bom dia", "boa tarde" ou qualquer saudação novamente.
- NÃO repita seu nome ou quem você é.
- Continue a conversa de forma natural, respondendo DIRETAMENTE à pergunta/mensagem do cliente.
- Mantenha o contexto da conversa anterior.` : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente uma única vez.'}

## Diretrizes
- Mantenha respostas curtas (máximo 2-3 frases) e objetivas
- Se não souber responder, ofereça transferir para um atendente humano
- Não invente informações que não foram fornecidas acima`;
          }

          const messages = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.map(msg => ({
              role: msg.direction === 'inbound' ? 'user' : 'assistant',
              content: msg.content || ''
            })),
            { role: 'user', content: messageContent }
          ];
          
          console.log('Sending', messages.length, 'messages to AI, hasPreviousBotMessages:', hasPreviousBotMessages);
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages,
              max_tokens: 200,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            responseMessage = aiData.choices?.[0]?.message?.content || chatbotConfig.away_message || 'Desculpe, não consegui processar sua mensagem.';
            console.log('AI response generated:', responseMessage);
          } else {
            const errorText = await aiResponse.text();
            console.error('AI API error:', aiResponse.status, errorText);
            responseMessage = chatbotConfig.away_message || 'Desculpe, estou com dificuldades no momento. Um atendente entrará em contato em breve.';
          }
        } catch (aiError) {
          console.error('AI error:', aiError);
          responseMessage = chatbotConfig.away_message || 'Desculpe, estou com dificuldades no momento.';
        }
      } else {
        console.log('No LOVABLE_API_KEY configured');
        responseMessage = chatbotConfig.away_message || 'Olá! Um atendente entrará em contato em breve.';
      }
    }

    // Add agent signature if enabled
    if (agentToUse?.sign_conversations && agentToUse.nickname && responseMessage) {
      responseMessage = `${responseMessage}\n\n- ${agentToUse.nickname}`;
    }

    // Send the response via Z-API
    if (responseMessage && instanceId && token) {
      const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
      const sent = await sendZApiMessage(instanceId, token, senderPhone, responseMessage, clientToken);
      
      if (sent) {
        // Store bot message
        const { data: channel } = await supabase
          .from('channels')
          .select('phone')
          .eq('id', channelId)
          .single();

        await supabase
          .from('whatsapp_messages')
          .insert({
            channel_id: channelId,
            organization_id: organizationId,
            message_id: `bot_zapi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sender_phone: channel?.phone || '',
            message_type: 'text',
            content: responseMessage,
            direction: 'outbound',
            status: 'sent',
            metadata: { 
              destination: senderPhone.replace(/\D/g, ''), 
              is_bot: true,
              transferred: shouldTransfer,
              provider: 'zapi'
            }
          });
        
        console.log('Bot message stored in database');
      }
    }

    return new Response(
      JSON.stringify({ 
        handled: true, 
        response: responseMessage,
        transferred: shouldTransfer,
        qualified: shouldQualify,
        leadId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Z-API chatbot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
