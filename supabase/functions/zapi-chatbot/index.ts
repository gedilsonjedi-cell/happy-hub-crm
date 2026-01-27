import { createClient } from "npm:@supabase/supabase-js@2";

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
const MESSAGE_CACHE_TTL = 60000;

function isMessageProcessed(messageId: string): boolean {
  const now = Date.now();
  
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
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
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

    if (!response.ok) {
      console.error('Error sending Z-API message:', await response.text());
      return false;
    }

    console.log('Z-API message sent successfully to:', recipientPhone);
    return true;
  } catch (error) {
    console.error('Error sending Z-API message:', error);
    return false;
  }
}

// Version marker: v6.0.0 - 2026-01-27 - Fixed repeated questions

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

    console.log('[v6] Z-API Chatbot processing:', { channelId, senderPhone, messageContent: messageContent?.substring(0, 50), messageId });

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
      .select('*, campaign_chatbot_id, bot_paused_until')
      .eq('conversation_phone', senderPhone)
      .eq('channel_id', channelId)
      .single();

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
    
    // Check if bot is paused
    if (assignment?.bot_paused_until) {
      const pausedUntil = new Date(assignment.bot_paused_until);
      if (pausedUntil > new Date()) {
        console.log('Bot is paused until:', pausedUntil.toISOString());
        return new Response(
          JSON.stringify({ handled: false, reason: 'Bot paused - human handling' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Find or create lead
    let leadId = assignment?.lead_id;
    if (!leadId) {
      const normalizedSenderPhone = senderPhone.replace(/\D/g, '');
      
      const phoneSearchPatterns = [
        normalizedSenderPhone,
        `+${normalizedSenderPhone}`,
      ];
      
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', organizationId)
        .in('phone', phoneSearchPatterns)
        .limit(1)
        .maybeSingle();

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

    if (shouldQualify && leadId && chatbotConfig.qualified_stage_id) {
      await supabase
        .from('leads')
        .update({ stage_id: chatbotConfig.qualified_stage_id })
        .eq('id', leadId);
    }

    let responseMessage = '';
    let shouldTransfer = false;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (LOVABLE_API_KEY) {
      try {
        const customerPhoneClean = senderPhone.replace(/\D/g, '');
        const customerPhoneSuffix = customerPhoneClean.slice(-8);
        
        console.log('[v6] Fetching history for customer suffix:', customerPhoneSuffix);
        
        // Fetch inbound and outbound messages
        const { data: inboundHistory } = await supabase
          .from('whatsapp_messages')
          .select('content, direction, created_at, sender_phone, metadata')
          .eq('channel_id', channelId)
          .eq('direction', 'inbound')
          .like('sender_phone', `%${customerPhoneSuffix}`)
          .order('created_at', { ascending: true })
          .limit(50);
        
        const { data: outboundHistory } = await supabase
          .from('whatsapp_messages')
          .select('content, direction, created_at, sender_phone, metadata')
          .eq('channel_id', channelId)
          .eq('direction', 'outbound')
          .order('created_at', { ascending: true })
          .limit(50);
        
        // Filter outbound to only those sent to this customer
        const filteredOutbound = (outboundHistory || []).filter(msg => {
          const destination = ((msg.metadata as any)?.destination || '').replace(/\D/g, '');
          return destination.endsWith(customerPhoneSuffix) || customerPhoneClean.endsWith(destination.slice(-8));
        });
        
        // Merge and sort
        const conversationHistory = [...(inboundHistory || []), ...filteredOutbound]
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        console.log('[v6] Total conversation history:', conversationHistory.length);

        // Fetch conversation memory
        const { data: existingMemory } = await supabase
          .from('conversation_memory')
          .select('*')
          .eq('channel_id', channelId)
          .eq('contact_phone', customerPhoneClean)
          .gt('expires_at', new Date().toISOString())
          .single();
        
        const memorySummary = existingMemory?.memory_summary || '';
        const collectedInfo: Record<string, any> = existingMemory?.collected_info || {};
        
        console.log('[v6] Collected info from memory:', JSON.stringify(collectedInfo));

        const hasPreviousBotMessages = conversationHistory.some(msg => msg.direction === 'outbound');
        const hasServiceGuide = agentToUse?.service_guide_enabled && agentToUse?.service_guide;

        // Build collected info display with explicit "DO NOT ASK" markers
        const collectedInfoDisplay = Object.keys(collectedInfo).length > 0 
          ? Object.entries(collectedInfo).map(([key, value]) => `✅ ${key.toUpperCase()}: ${value} (JÁ COLETADO - NÃO PERGUNTE!)`).join('\n')
          : '(Nenhuma informação coletada ainda - comece pelo início do guia)';

        let systemPrompt = `Você é um assistente virtual de atendimento ao cliente via WhatsApp. 
Seja cordial, objetivo e útil. Mantenha respostas curtas (máximo 2-3 frases).

## IMPORTANTE - Regras de Saudação
${hasPreviousBotMessages ? '- Esta conversa já está em andamento. NÃO se apresente novamente.' : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente.'}`;

        if (agentToUse) {
          systemPrompt = `Você é ${agentToUse.name}, um assistente virtual de atendimento ao cliente via WhatsApp.

${agentToUse.agent_profile ? `## Perfil\n${agentToUse.agent_profile}\n` : ''}
${agentToUse.communication_style ? `## Estilo de Comunicação\n${agentToUse.communication_style}\n` : ''}
${agentToUse.objective ? `## Objetivo\n${agentToUse.objective}\n` : ''}
${agentToUse.company_info ? `## Sobre a Empresa\n${agentToUse.company_info}\n` : ''}
${agentToUse.products_services ? `## Produtos e Serviços\n${agentToUse.products_services}\n` : ''}
${agentToUse.faq ? `## FAQ\n${agentToUse.faq}\n` : ''}
${hasServiceGuide ? `## GUIA DE ATENDIMENTO - SIGA ESTE ROTEIRO OBRIGATORIAMENTE
${agentToUse.service_guide}

### ⚠️ INFORMAÇÕES JÁ COLETADAS - NÃO PERGUNTE NOVAMENTE ⚠️
${collectedInfoDisplay}

### REGRA ABSOLUTA - PROIBIDO REPETIR PERGUNTAS
🚫 VOCÊ ESTÁ PROIBIDO de perguntar novamente sobre qualquer item marcado com ✅ acima.

### TRANSFERÊNCIA IMEDIATA
⚡ QUANDO O CLIENTE CONFIRMAR QUE DESEJA SEGUIR (dizendo "sim", "quero", "pode ser", etc) APÓS VOCÊ APRESENTAR O PERFIL DELE:
1. Responda: "Ótimo! Vou transferir você para um de nossos especialistas que irá finalizar sua análise. Aguarde um momento."
2. OBRIGATÓRIO: Adicione [TRANSFERIR_PARA_ATENDENTE] no final da sua resposta

### RASTREAMENTO
Ao final de CADA resposta, adicione: [INFO_COLETADA:campo=valor]
` : ''}
${memorySummary ? `## MEMÓRIA DE CONVERSAS ANTERIORES
${memorySummary}
` : ''}
## IMPORTANTE - Regras de Saudação e Continuidade
${hasPreviousBotMessages || memorySummary ? `- Esta conversa já está em andamento. NÃO se apresente novamente. 
- NÃO diga "olá", "oi", "bom dia", "boa tarde" ou qualquer saudação.
- Continue a conversa respondendo DIRETAMENTE à pergunta do cliente.` : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente.'}

## Diretrizes
- Mantenha respostas curtas (máximo 2-3 frases) e objetivas
- Não invente informações

## CORREÇÕES DO CLIENTE
- O cliente pode digitar errado e depois CORRIGIR
- Quando o cliente corrigir uma informação, ACEITE e continue

## INTERPRETAÇÃO DE CRITÉRIOS MÍNIMOS
- Quando um critério diz "mínimo de X", você DEVE fazer a comparação CORRETA:
  - Se cliente tem IGUAL ou MAIS que o mínimo → QUALIFICA
  - Se cliente tem MENOS que o mínimo → NÃO qualifica
- Exemplo: mínimo 3 meses → 5 meses QUALIFICA (5 > 3)`;
        }

        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.content || ''
          })),
          { role: 'user', content: messageContent }
        ];

        console.log('[v6] Sending', messages.length, 'messages to AI');
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages,
            max_tokens: 300,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          let aiMessage = aiData.choices?.[0]?.message?.content || chatbotConfig.away_message;
          
          // Extract collected info from AI response
          const infoMatches = aiMessage.matchAll(/\[INFO_COLETADA:([^=]+)=([^\]]+)\]/g);
          const newCollectedInfo = { ...collectedInfo };
          for (const match of infoMatches) {
            const field = match[1].trim().toLowerCase().replace(/\s+/g, '_');
            const value = match[2].trim();
            newCollectedInfo[field] = value;
            console.log('[v6] Info collected:', field, '=', value);
          }
          
          // Remove info tags from visible message
          aiMessage = aiMessage.replace(/\[INFO_COLETADA:[^\]]+\]/g, '').trim();
          
          // Check if AI indicates transfer is ready
          if (aiMessage.includes('[TRANSFERIR_PARA_ATENDENTE]')) {
            shouldTransfer = true;
            aiMessage = aiMessage.replace(/\[TRANSFERIR_PARA_ATENDENTE\]/g, '').trim();
            console.log('[v6] AI indicated transfer is ready');
          }
          
          Object.assign(collectedInfo, newCollectedInfo);
          
          responseMessage = aiMessage;
          console.log('[v6] AI response generated, collected:', Object.keys(collectedInfo).length, 'items');
          
          // Handle transfer
          if (shouldTransfer) {
            const { data: availableAttendants } = await supabase
              .from('attendant_availability')
              .select('*')
              .eq('organization_id', organizationId)
              .eq('is_available', true)
              .lt('current_conversations', 5)
              .order('last_assignment_at', { ascending: true, nullsFirst: true })
              .limit(1);
            
            if (availableAttendants && availableAttendants.length > 0) {
              const attendant = availableAttendants[0];
              
              await supabase
                .from('conversation_assignments')
                .update({
                  assigned_to: attendant.user_id,
                  assigned_at: new Date().toISOString(),
                  is_bot_handling: false,
                  status: 'assigned'
                })
                .eq('id', assignment?.id);

              await supabase
                .from('attendant_availability')
                .update({
                  current_conversations: attendant.current_conversations + 1,
                  last_assignment_at: new Date().toISOString()
                })
                .eq('id', attendant.id);

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
                }
              }

              responseMessage = `${responseMessage}\n\n${chatbotConfig.transfer_message}`;
            } else {
              responseMessage = `${responseMessage}\n\n${chatbotConfig.away_message}`;
            }
          }
          
          // Update conversation memory
          try {
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            
            await supabase
              .from('conversation_memory')
              .upsert({
                channel_id: channelId,
                contact_phone: customerPhoneClean,
                organization_id: organizationId,
                memory_summary: memorySummary || 'Conversa iniciada',
                collected_info: collectedInfo,
                last_interaction_at: new Date().toISOString(),
                expires_at: expiresAt,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'channel_id,contact_phone'
              });
            
            console.log('[v6] Memory updated with collected info:', Object.keys(collectedInfo));
          } catch (memoryError) {
            console.error('[v6] Error updating memory:', memoryError);
          }
        } else {
          console.error('[v6] AI API error:', aiResponse.status);
          responseMessage = chatbotConfig.away_message;
        }
      } catch (aiError) {
        console.error('[v6] AI error:', aiError);
        responseMessage = chatbotConfig.away_message;
      }
    } else {
      responseMessage = chatbotConfig.away_message || 'Olá! Um atendente entrará em contato em breve.';
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
