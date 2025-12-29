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
      campaignChatbotId // Optional: chatbot ID from campaign
    } = await req.json();

    console.log('Chatbot processing message:', { channelId, senderPhone, messageContent, campaignChatbotId });

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

    // Determine which agent to use: campaign override > channel config > default AI
    let agentToUse: AIAgent | null = null;
    const agentIdToUse = campaignChatbotId || chatbotConfig.agent_id;

    if (agentIdToUse) {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('id, name, agent_profile, communication_style, objective, company_info, products_services, faq')
        .eq('id', agentIdToUse)
        .eq('is_active', true)
        .single();

      if (agent) {
        agentToUse = agent;
        console.log('Using AI agent:', agent.name, campaignChatbotId ? '(from campaign)' : '(from channel config)');
      }
    }

    // Check or create conversation assignment
    let { data: assignment } = await supabase
      .from('conversation_assignments')
      .select('*')
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
        .select()
        .single();

      if (assignError) {
        console.error('Error creating assignment:', assignError);
      }
      assignment = newAssignment;
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
        .single();

      if (existingLead) {
        leadId = existingLead.id;
      } else {
        // Get channel owner to assign as lead owner
        const { data: channel } = await supabase
          .from('channels')
          .select('user_id')
          .eq('id', channelId)
          .single();

        if (channel) {
          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              name: senderName || senderPhone,
              phone: senderPhone,
              user_id: channel.user_id,
              organization_id: organizationId,
              stage_id: chatbotConfig.initial_stage_id
            })
            .select()
            .single();

          if (newLead) {
            leadId = newLead.id;
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

    // Check for available attendants
    const { data: availableAttendants } = await supabase
      .from('attendant_availability')
      .select('*')
      .eq('is_available', true)
      .lt('current_conversations', 5) // Less than max conversations
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

      responseMessage = chatbotConfig.transfer_message;
      shouldTransfer = true;
      console.log('Conversation transferred to attendant:', attendant.user_id);
    } else {
      // No attendants available - bot handles with AI
      if (isNewConversation) {
        responseMessage = chatbotConfig.welcome_message;
      } else {
        // Generate AI response
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        if (LOVABLE_API_KEY) {
          try {
            // Get conversation history
            const { data: history } = await supabase
              .from('whatsapp_messages')
              .select('content, direction')
              .eq('channel_id', channelId)
              .or(`sender_phone.eq.${senderPhone},metadata->>destination.eq.${senderPhone.replace(/\D/g, '')}`)
              .order('created_at', { ascending: true })
              .limit(10);

            // Build system prompt based on agent configuration
            let systemPrompt = `Você é um assistente virtual de atendimento ao cliente via WhatsApp. 
Seja cordial, objetivo e útil. Mantenha respostas curtas (máximo 2-3 frases).
Se o cliente perguntar sobre preços, produtos ou quiser falar com um humano, informe que irá transferir para um atendente.
Não invente informações sobre produtos ou preços específicos.`;

            if (agentToUse) {
              systemPrompt = `Você é ${agentToUse.name}, um assistente virtual de atendimento ao cliente via WhatsApp.

${agentToUse.agent_profile ? `## Perfil\n${agentToUse.agent_profile}\n` : ''}
${agentToUse.communication_style ? `## Estilo de Comunicação\n${agentToUse.communication_style}\n` : ''}
${agentToUse.objective ? `## Objetivo\n${agentToUse.objective}\n` : ''}
${agentToUse.company_info ? `## Sobre a Empresa\n${agentToUse.company_info}\n` : ''}
${agentToUse.products_services ? `## Produtos e Serviços\n${agentToUse.products_services}\n` : ''}
${agentToUse.faq ? `## FAQ\n${agentToUse.faq}\n` : ''}

## Diretrizes
- Mantenha respostas curtas (máximo 2-3 frases) e objetivas
- Se não souber responder, ofereça transferir para um atendente humano
- Não invente informações que não foram fornecidas acima`;
            }

            const messages = [
              { role: 'system', content: systemPrompt },
              ...(history || []).map(msg => ({
                role: msg.direction === 'inbound' ? 'user' : 'assistant',
                content: msg.content || ''
              })),
              { role: 'user', content: messageContent }
            ];

            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages,
                max_tokens: 150,
              }),
            });

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              responseMessage = aiData.choices?.[0]?.message?.content || chatbotConfig.away_message;
            } else {
              console.error('AI API error:', aiResponse.status);
              responseMessage = chatbotConfig.away_message;
            }
          } catch (aiError) {
            console.error('AI error:', aiError);
            responseMessage = chatbotConfig.away_message;
          }
        } else {
          responseMessage = chatbotConfig.away_message;
        }
      }
    }

    // Send the response via Gupshup
    if (responseMessage) {
      const { data: channel } = await supabase
        .from('channels')
        .select('access_token, app_name, phone')
        .eq('id', channelId)
        .single();

      if (channel?.access_token && channel?.app_name) {
        const cleanDestination = senderPhone.replace(/\D/g, '');
        const cleanSource = channel.phone.replace(/\D/g, '');

        const formData = new URLSearchParams();
        formData.append('channel', 'whatsapp');
        formData.append('source', cleanSource);
        formData.append('destination', cleanDestination);
        formData.append('src.name', channel.app_name);
        formData.append('message', JSON.stringify({
          type: 'text',
          text: responseMessage
        }));

        const gupshupResponse = await fetch(
          'https://api.gupshup.io/wa/api/v1/msg',
          {
            method: 'POST',
            headers: {
              'apikey': channel.access_token,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
          }
        );

        const gupshupData = await gupshupResponse.text();
        console.log('Gupshup response:', gupshupData);

        // Store bot message
        let responseJson;
        try {
          responseJson = JSON.parse(gupshupData);
        } catch {
          responseJson = { messageId: `bot_${Date.now()}` };
        }

        await supabase
          .from('whatsapp_messages')
          .insert({
            channel_id: channelId,
            organization_id: organizationId,
            message_id: responseJson.messageId || `bot_${Date.now()}`,
            sender_phone: channel.phone,
            message_type: 'text',
            content: responseMessage,
            direction: 'outbound',
            status: 'sent',
            metadata: { 
              destination: cleanDestination, 
              is_bot: true,
              transferred: shouldTransfer
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
    console.error('Error in chatbot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
