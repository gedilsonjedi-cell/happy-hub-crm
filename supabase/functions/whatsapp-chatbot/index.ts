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

// Version marker for deploy verification: v2.0.0 - 2026-01-27
// Removed all duplicate checks since meta-webhook handles deduplication

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
      campaignChatbotId // Optional: chatbot ID from campaign
    } = await req.json();

    console.log('[v2] Chatbot processing message:', { channelId, senderPhone, messageContent: messageContent?.substring(0, 50), messageId });

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

    // Determine which agent to use: 
    // Priority: 1) campaignChatbotId param, 2) assignment.campaign_chatbot_id, 3) channel config agent_id, 4) default AI
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
        const source = campaignChatbotId ? 'from param' : 
                       assignment?.campaign_chatbot_id ? 'from campaign assignment' : 
                       'from channel config';
        console.log('Using AI agent:', agent.name, `(${source})`);
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
    
    // Check if bot is paused (human sent a message recently)
    if (assignment?.bot_paused_until) {
      const pausedUntil = new Date(assignment.bot_paused_until);
      if (pausedUntil > new Date()) {
        console.log('Bot is paused until:', pausedUntil.toISOString(), '- human is handling');
        return new Response(
          JSON.stringify({ handled: false, reason: 'Bot paused - human handling' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Find or create lead
    let leadId = assignment?.lead_id;
    if (!leadId) {
      // Normalize phone for search - remove all non-digits
      const normalizedSenderPhone = senderPhone.replace(/\D/g, '');
      
      // Search for lead using parameterized query (safer than string interpolation)
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
        
        // Move lead to "Pré-Atendimento" stage if it has no stage
        const { data: leadData } = await supabase
          .from('leads')
          .select('stage_id')
          .eq('id', leadId)
          .single();
        
        if (leadData && !leadData.stage_id) {
          // Find "Pré-Atendimento" stage
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
            
            console.log('Lead moved to Pré-Atendimento stage');
          }
        }
      } else {
        // Get channel owner to assign as lead owner
        const { data: channel } = await supabase
          .from('channels')
          .select('user_id, organization_id')
          .eq('id', channelId)
          .single();

        if (channel) {
          // Find "Pré-Atendimento" stage for new leads
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
            console.log('New lead created in Pré-Atendimento stage');
          }
        }
      }

      // Update assignment with lead_id
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

    // NOVA LÓGICA: Bot SEMPRE responde primeiro com IA, só transfere quando IA indicar
    let responseMessage = '';
    let shouldTransfer = false;

    // Generate AI response (ALWAYS, regardless of attendant availability)
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
        
        console.log('[v3] Conversation history found:', conversationHistory.length, 'messages for phone:', customerPhoneClean);

        // Fetch conversation memory (persisted context from previous sessions)
        const { data: existingMemory } = await supabase
          .from('conversation_memory')
          .select('*')
          .eq('channel_id', channelId)
          .eq('contact_phone', customerPhoneClean)
          .gt('expires_at', new Date().toISOString())
          .single();
        
        const memorySummary = existingMemory?.memory_summary || '';
        const collectedInfo = existingMemory?.collected_info || {};
        
        if (existingMemory) {
          console.log('[v3] Found conversation memory:', memorySummary);
        }

        // Determine if this is the first message (no previous bot messages)
        const hasPreviousBotMessages = conversationHistory.some(msg => msg.direction === 'outbound');

        // Build system prompt based on agent configuration
        let systemPrompt = `Você é um assistente virtual de atendimento ao cliente via WhatsApp. 
Seja cordial, objetivo e útil. Mantenha respostas curtas (máximo 2-3 frases).
Se o cliente perguntar sobre preços, produtos ou quiser falar com um humano, informe que irá transferir para um atendente.
Não invente informações sobre produtos ou preços específicos.

## IMPORTANTE - Regras de Saudação
${hasPreviousBotMessages ? '- Esta conversa já está em andamento. NÃO se apresente novamente. NÃO diga "olá" ou "oi" novamente. Continue a conversa de forma natural, respondendo diretamente à pergunta/mensagem do cliente.' : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente.'}`;

        // Check if agent has service guide - this changes transfer behavior
        const hasServiceGuide = agentToUse?.service_guide_enabled && agentToUse?.service_guide;

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

### INSTRUÇÕES CRÍTICAS DO GUIA
- Você DEVE seguir o roteiro acima de forma estruturada durante TODO o atendimento
- NÃO transfira para um atendente humano até completar TODAS as etapas do guia
- Conduza a conversa passo a passo conforme descrito no guia
- Se o cliente fizer perguntas fora do script, responda brevemente e volte ao roteiro
- Adapte a linguagem ao seu estilo de comunicação, mas mantenha a estrutura do roteiro
- Seu objetivo é completar TODAS as etapas do guia para um atendimento de qualidade
- SOMENTE ao final do guia, após coletar todas as informações necessárias, você pode transferir para um atendente

### TRANSFERÊNCIA
- APENAS quando você completar TODO o roteiro do guia e tiver coletado todas as informações necessárias
- APENAS quando você adicionar a tag especial [TRANSFERIR_PARA_ATENDENTE] no FINAL da sua resposta
- Essa tag é invisível para o cliente, ela serve apenas como sinal para o sistema
- Se ainda não completou o guia, NÃO use essa tag
` : `## TRANSFERÊNCIA IMEDIATA
- Como não há guia de atendimento, você pode transferir a qualquer momento se necessário
- Se o cliente quiser falar com um humano ou você não souber responder, adicione [TRANSFERIR_PARA_ATENDENTE] no final da resposta
`}
${memorySummary ? `## MEMÓRIA DE CONVERSAS ANTERIORES
O cliente já conversou com você anteriormente. Aqui está o resumo do que você sabe sobre ele:
${memorySummary}

Use essas informações para personalizar o atendimento. Faça referência ao que já foi conversado quando relevante.
Se você já coletou informações do guia em sessões anteriores, leve em conta e continue de onde parou.
` : ''}
## IMPORTANTE - Regras de Saudação e Continuidade
${hasPreviousBotMessages || memorySummary ? `- Esta conversa já está em andamento ou o cliente já conversou antes. NÃO se apresente novamente. 
- NÃO diga "olá", "oi", "bom dia", "boa tarde" ou qualquer saudação novamente.
- NÃO repita seu nome ou quem você é.
- Continue a conversa de forma natural, respondendo DIRETAMENTE à pergunta/mensagem do cliente.
- Mantenha o contexto da conversa anterior.
- Se o cliente está retornando depois de um tempo, faça referência ao que já foi conversado.` : '- Esta é a primeira interação com este cliente. Você pode se apresentar brevemente uma única vez.'}

## Diretrizes
- Mantenha respostas curtas (máximo 2-3 frases) e objetivas
- Se não souber responder, continue tentando ajudar dentro do escopo do guia
- Não invente informações que não foram fornecidas acima
- LEMBRE-SE: A tag [TRANSFERIR_PARA_ATENDENTE] só deve aparecer quando você COMPLETOU o atendimento conforme o guia`;
        }

        const messages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory.map(msg => ({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.content || ''
          })),
          { role: 'user', content: messageContent }
        ];

        console.log('[v3] Sending', messages.length, 'messages to AI, hasServiceGuide:', hasServiceGuide);
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages,
            max_tokens: 300, // Increased for more detailed responses
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          let aiMessage = aiData.choices?.[0]?.message?.content || chatbotConfig.away_message;
          
          // Check if AI indicates transfer is ready
          if (aiMessage.includes('[TRANSFERIR_PARA_ATENDENTE]')) {
            shouldTransfer = true;
            // Remove the tag from the visible message
            aiMessage = aiMessage.replace(/\[TRANSFERIR_PARA_ATENDENTE\]/g, '').trim();
            console.log('[v3] AI indicated transfer is ready after completing service guide');
          }
          
          responseMessage = aiMessage;
          console.log('[v3] AI response generated, shouldTransfer:', shouldTransfer);
          
          // If transfer was triggered, now assign to attendant
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
                    
                    console.log('[v3] Lead moved to Qualificação stage after transfer');
                  }
                }
              }

              // Add transfer message to the response
              responseMessage = `${responseMessage}\n\n${chatbotConfig.transfer_message}`;
              console.log('[v3] Conversation transferred to attendant:', attendant.user_id);
            } else {
              // No attendant available, add away message
              responseMessage = `${responseMessage}\n\n${chatbotConfig.away_message}`;
              console.log('[v3] Transfer requested but no attendants available');
            }
          }
          
          // Update conversation memory after successful response
          try {
            const memoryMessages = [
              { role: 'system', content: `Você é um assistente que extrai informações importantes de conversas para criar um resumo de memória.
Analise a conversa e extraia:
1. Objetivo/interesse do cliente (ex: emagrecimento, ganho de massa)
2. Preferências declaradas (ex: online, presencial)
3. Informações pessoais relevantes mencionadas
4. Estágio atual do atendimento/guia (ex: coletando informações, apresentando planos)
5. Informações já coletadas do guia de atendimento
6. Qualquer outra informação útil para continuar o atendimento no futuro

Responda APENAS com um resumo conciso em formato de bullet points, máximo 7 itens.
Se não houver informações relevantes novas, responda apenas: "Sem novas informações"` },
              ...conversationHistory.slice(-10).map(msg => ({
                role: msg.direction === 'inbound' ? 'user' : 'assistant',
                content: msg.content || ''
              })),
              { role: 'user', content: messageContent },
              { role: 'assistant', content: responseMessage }
            ];
            
            const memoryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash-lite',
                messages: memoryMessages,
                max_tokens: 200,
              }),
            });
            
            if (memoryResponse.ok) {
              const memoryData = await memoryResponse.json();
              const newMemorySummary = memoryData.choices?.[0]?.message?.content || '';
              
              if (newMemorySummary && !newMemorySummary.includes('Sem novas informações')) {
                // Combine with existing memory if present
                const combinedMemory = memorySummary 
                  ? `${memorySummary}\n\n--- Atualização recente ---\n${newMemorySummary}`
                  : newMemorySummary;
                
                // Upsert conversation memory
                const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                
                await supabase
                  .from('conversation_memory')
                  .upsert({
                    channel_id: channelId,
                    contact_phone: customerPhoneClean,
                    organization_id: organizationId,
                    memory_summary: combinedMemory.slice(0, 2000), // Limit size
                    collected_info: collectedInfo,
                    last_interaction_at: new Date().toISOString(),
                    expires_at: expiresAt,
                    updated_at: new Date().toISOString()
                  }, {
                    onConflict: 'channel_id,contact_phone'
                  });
                
                console.log('[v3] Conversation memory updated');
              }
            }
          } catch (memoryError) {
            console.error('[v3] Error updating memory:', memoryError);
          }
        } else {
          console.error('[v3] AI API error:', aiResponse.status);
          responseMessage = chatbotConfig.away_message;
        }
      } catch (aiError) {
        console.error('[v3] AI error:', aiError);
        responseMessage = chatbotConfig.away_message;
      }
    } else {
      responseMessage = chatbotConfig.away_message;
    }

    // Send the response via Meta Cloud API
    if (responseMessage) {
      const { data: channel } = await supabase
        .from('channels')
        .select('access_token, phone, provider, app_name')
        .eq('id', channelId)
        .single();

      if (channel?.access_token) {
        const cleanDestination = senderPhone.replace(/\D/g, '');
        
        // Use Meta Cloud API - app_name stores the phone_number_id
        const phoneNumberId = channel.app_name || channel.phone.replace(/\D/g, '');
        
        const metaPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanDestination,
          type: 'text',
          text: { body: responseMessage }
        };
        
        console.log('[v3] Sending message via Meta API to:', cleanDestination);
        
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
        console.log('[v3] Meta API response:', JSON.stringify(metaData));

        // Store bot message
        const messageId = metaData.messages?.[0]?.id || `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await supabase
          .from('whatsapp_messages')
          .insert({
            channel_id: channelId,
            organization_id: organizationId,
            message_id: messageId,
            sender_phone: channel.phone,
            message_type: 'text',
            content: responseMessage,
            direction: 'outbound',
            status: metaData.messages?.[0]?.id ? 'sent' : 'failed',
            metadata: { 
              destination: cleanDestination, 
              is_bot: true,
              transferred: shouldTransfer,
              meta_response: metaData
            }
          });
        
        if (!metaData.messages?.[0]?.id) {
          console.error('[v3] Meta send failed:', metaData.error);
        }
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
