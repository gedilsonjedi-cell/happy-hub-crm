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

interface ConversationAssignment {
  id: string;
  conversation_phone: string;
  channel_id: string;
  assigned_to: string | null;
  is_bot_handling: boolean;
  lead_id: string | null;
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
}

// Version marker for deploy verification: v6.0.0 - 2026-01-27 - Fixed repeated questions

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
      campaignChatbotId
    } = await req.json();

    console.log('[v6] Chatbot processing message:', { channelId, senderPhone, messageContent: messageContent?.substring(0, 50), messageId });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // External DB for whatsapp_messages
    const _extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const _extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    const messageDb = (_extUrl && _extKey) ? createClient(_extUrl, _extKey) : supabase;

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

    // Check or create conversation assignment first to get potential campaign_chatbot_id
    let { data: assignment } = await supabase
      .from('conversation_assignments')
      .select('*, campaign_chatbot_id, bot_paused_until')
      .eq('conversation_phone', senderPhone)
      .eq('channel_id', channelId)
      .single();

    const isNewConversation = !assignment;

    if (!assignment) {
      // Create new assignment
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
        .select('id, name, agent_profile, communication_style, objective, company_info, products_services, faq, service_guide_enabled, service_guide')
        .eq('id', agentIdToUse)
        .eq('is_active', true)
        .single();

      if (agent) {
        agentToUse = agent;
        console.log('Using AI agent:', agent.name);
      }
    }

    // Check if a human is handling this conversation OR if bot is paused
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
        .in('phone', phoneSearchPatterns)
        .limit(1)
        .maybeSingle();

      if (existingLead) {
        leadId = existingLead.id;
        
        const { data: leadData } = await supabase
          .from('leads')
          .select('stage_id')
          .eq('id', leadId)
          .single();
        
        if (leadData && !leadData.stage_id) {
          const { data: preAtendimentoStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .ilike('name', '%pré-atendimento%')
            .limit(1)
            .single();
          
          if (preAtendimentoStage) {
            await supabase
              .from('leads')
              .update({ stage_id: preAtendimentoStage.id })
              .eq('id', leadId);
          }
        }
      } else {
        const { data: channel } = await supabase
          .from('channels')
          .select('user_id, organization_id')
          .eq('id', channelId)
          .single();

        if (channel) {
          const { data: preAtendimentoStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('organization_id', channel.organization_id)
            .ilike('name', '%pré-atendimento%')
            .limit(1)
            .single();
          
          const stageToUse = preAtendimentoStage?.id || chatbotConfig.initial_stage_id;
          
          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              name: senderName || senderPhone,
              phone: senderPhone,
              user_id: channel.user_id,
              organization_id: organizationId,
              stage_id: stageToUse
            })
            .select()
            .single();

          if (newLead) {
            leadId = newLead.id;
          }
        }
      }

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
        
        // Fetch inbound and outbound messages separately then merge
        const { data: inboundHistory } = await messageDb
          .from('whatsapp_messages')
          .select('content, direction, created_at, sender_phone, metadata')
          .eq('channel_id', channelId)
          .eq('direction', 'inbound')
          .like('sender_phone', `%${customerPhoneSuffix}`)
          .order('created_at', { ascending: true })
          .limit(50);
        
        const { data: outboundHistory } = await messageDb
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
                const { data: channelData } = await supabase
                  .from('channels')
                  .select('organization_id')
                  .eq('id', channelId)
                  .single();
                
                if (channelData?.organization_id) {
                  const { data: qualificacaoStage } = await supabase
                    .from('pipeline_stages')
                    .select('id')
                    .eq('organization_id', channelData.organization_id)
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
      responseMessage = chatbotConfig.away_message;
    }

    // Send the response via the appropriate provider
    if (responseMessage) {
      const { data: channel } = await supabase
        .from('channels')
        .select('access_token, phone, provider, app_name')
        .eq('id', channelId)
        .single();

      if (channel?.access_token) {
        const cleanDestination = senderPhone.replace(/\D/g, '');
        let msgId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        let sendSuccess = false;

        if (channel.provider === 'gupshup') {
          // Send via Gupshup API
          const sourcePhone = channel.phone.replace(/\D/g, '');
          const appName = channel.app_name || '';
          const formData = new URLSearchParams();
          formData.append('channel', 'whatsapp');
          formData.append('source', sourcePhone);
          formData.append('src.name', appName);
          formData.append('destination', cleanDestination);
          formData.append('message', JSON.stringify({ type: 'text', text: responseMessage }));

          console.log('[v6] Sending message via Gupshup API');
          const gupshupResponse = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'apikey': channel.access_token,
            },
            body: formData.toString(),
          });

          const gupshupText = await gupshupResponse.text();
          console.log('[v6] Gupshup API response:', gupshupText);
          
          try {
            const gupshupData = JSON.parse(gupshupText);
            if (gupshupData.messageId) {
              msgId = gupshupData.messageId;
              sendSuccess = true;
            }
          } catch {
            console.error('Failed to parse Gupshup response');
          }
        } else if (channel.provider === 'zapi') {
          // Send via Z-API
          const instanceId = channel.app_name || '';
          const zapiToken = channel.access_token;
          
          console.log('[v6] Sending message via Z-API');
          const zapiResponse = await fetch(
            `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone: cleanDestination, message: responseMessage }),
            }
          );

          const zapiData = await zapiResponse.json();
          console.log('[v6] Z-API response:', JSON.stringify(zapiData));
          if (zapiData.messageId || zapiData.zapiMessageId) {
            msgId = zapiData.messageId || zapiData.zapiMessageId;
            sendSuccess = true;
          }
        } else {
          // Send via Meta Cloud API (default)
          const phoneNumberId = channel.app_name || channel.phone.replace(/\D/g, '');
          const metaPayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanDestination,
            type: 'text',
            text: { body: responseMessage }
          };
          
          console.log('[v6] Sending message via Meta API');
          const metaResponse = await fetch(
            `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${channel.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(metaPayload)
            }
          );

          const metaData = await metaResponse.json();
          console.log('[v6] Meta API response:', JSON.stringify(metaData));
          if (metaData.messages?.[0]?.id) {
            msgId = metaData.messages[0].id;
            sendSuccess = true;
          }
        }

        await messageDb
          .from('whatsapp_messages')
          .insert({
            channel_id: channelId,
            organization_id: organizationId,
            message_id: msgId,
            sender_phone: channel.phone,
            message_type: 'text',
            content: responseMessage,
            direction: 'outbound',
            status: sendSuccess ? 'sent' : 'failed',
            metadata: { 
              destination: cleanDestination, 
              is_bot: true,
              transferred: shouldTransfer,
              provider: channel.provider
            }
          });
        // Update conversation stats
        supabase.rpc('upsert_conversation_stats_manual', {
          _channel_id: channelId, _conversation_phone: cleanDestination,
          _content: responseMessage, _direction: 'outbound', _is_read: null,
          _sender_name: null, _created_at: new Date().toISOString(),
        }).then(() => {}, () => {});
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
    console.error('Error in chatbot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
