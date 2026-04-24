import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlowNode {
  id: string;
  node_type: string;
  data: {
    label?: string;
    message?: string;
    buttons?: { id: string; label: string; value: string }[];
    variable_name?: string;
    variable_type?: string;
    validation_message?: string;
    action_type?: string;
    transfer_message?: string;
    webhook_url?: string;
    media_url?: string;
    media_type?: 'audio' | 'image' | 'video' | 'document';
  };
}

interface FlowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string;
}

interface FlowSession {
  id: string;
  current_node_id: string | null;
  collected_data: Record<string, string>;
  status: string;
}

interface FlowMessage {
  message: string;
  buttons?: { label: string; value: string }[];
  media_url?: string;
  media_type?: 'audio' | 'image' | 'video' | 'document';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      flow_bot_id,
      channel_id, 
      contact_phone, 
      message_text,
      organization_id
    } = await req.json();

    console.log('Flow Bot Processor called:', { flow_bot_id, channel_id, contact_phone, message_text });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // deno-lint-ignore no-explicit-any
    const supabase: any = createClient(supabaseUrl, supabaseKey);

    // External DB for whatsapp_messages
    const _extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const _extKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY');
    // deno-lint-ignore no-explicit-any
    const messageDb: any = (_extUrl && _extKey) ? createClient(_extUrl, _extKey) : supabase;

    // Helper: create response AND send messages via Meta API
    async function respondWithMessages(messages: FlowMessage[], extra?: Record<string, unknown>) {
      // Send messages via Meta API (fire-and-forget safe — errors logged internally)
      await sendFlowMessages(messages, channel_id, contact_phone, organization_id, supabase, messageDb);
      return new Response(JSON.stringify({
        response_type: 'messages',
        messages,
        ...extra,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load flow bot configuration
    const { data: flowBot, error: botError } = await supabase
      .from('flow_bots')
      .select('*')
      .eq('id', flow_bot_id)
      .single();

    if (botError || !flowBot) {
      console.error('Flow bot not found:', botError);
      return new Response(JSON.stringify({ error: 'Flow bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!flowBot.is_active) {
      return new Response(JSON.stringify({ skip: true, reason: 'Bot inactive' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load nodes and edges
    const [nodesRes, edgesRes] = await Promise.all([
      supabase.from('flow_nodes').select('*').eq('flow_bot_id', flow_bot_id),
      supabase.from('flow_edges').select('*').eq('flow_bot_id', flow_bot_id)
    ]);

    const nodes: FlowNode[] = nodesRes.data || [];
    const edges: FlowEdge[] = edgesRes.data || [];

    console.log(`Loaded ${nodes.length} nodes and ${edges.length} edges`);

    // Get or create session
    let { data: session } = await supabase
      .from('flow_sessions')
      .select('*')
      .eq('flow_bot_id', flow_bot_id)
      .eq('channel_id', channel_id)
      .eq('contact_phone', contact_phone)
      .eq('status', 'active')
      .maybeSingle();

    // --- NEW SESSION: Start the flow ---
    if (!session) {
      // Check if there's already a completed/transferred session for this contact+channel+bot
      // If so, don't restart the flow — the bot already ran for this contact
      const { data: finishedSession } = await supabase
        .from('flow_sessions')
        .select('id, status')
        .eq('flow_bot_id', flow_bot_id)
        .eq('channel_id', channel_id)
        .eq('contact_phone', contact_phone)
        .in('status', ['completed', 'transferred'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (finishedSession) {
        console.log('Flow already completed/transferred for this contact, skipping:', finishedSession.id, finishedSession.status);
        return new Response(JSON.stringify({ 
          skip: true, 
          reason: 'Flow already completed for this contact' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Creating new flow session...');
      
      // Find the CORRECT start node - the one that has edges going OUT
      // This prevents selecting orphan start nodes that were duplicated
      const startNodes = nodes.filter(n => n.node_type === 'start');
      let startNode = null;
      
      for (const sn of startNodes) {
        const hasOutgoingEdge = edges.some(e => e.source_node_id === sn.id);
        if (hasOutgoingEdge) {
          startNode = sn;
          console.log('Found valid start node with edges:', sn.id);
          break;
        }
      }
      
      // Fallback to first start node if none have edges (shouldn't happen in valid flows)
      if (!startNode && startNodes.length > 0) {
        startNode = startNodes[0];
        console.warn('No start node with edges found, using first start node:', startNode.id);
      }
      
      if (!startNode) {
        return new Response(JSON.stringify({ error: 'No start node' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create new session starting at start node
      const { data: newSession, error: sessionError } = await supabase
        .from('flow_sessions')
        .insert({
          flow_bot_id,
          channel_id,
          contact_phone,
          current_node_id: startNode.id,
          collected_data: {},
          status: 'active'
        })
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        return new Response(JSON.stringify({ error: 'Failed to create session' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      session = newSession;

      // Walk through the flow starting from start node, collecting all messages until we hit an interactive node
      const { messages, finalNodeId, collectedData } = await walkFlowUntilInteractive(
        startNode.id,
        nodes,
        edges,
        session.collected_data,
        flowBot
      );

      // Update session with final node position
      await supabase
        .from('flow_sessions')
        .update({ 
          current_node_id: finalNodeId,
          collected_data: collectedData
        })
        .eq('id', session.id);

      console.log(`New session: sending ${messages.length} message(s), stopping at node ${finalNodeId}`);

      // Send messages via Meta API and return
      return respondWithMessages(messages);
    }

    // --- EXISTING SESSION: Process user input ---
    console.log('Processing existing session:', session.id, 'current node:', session.current_node_id);

    let currentNode = nodes.find(n => n.id === session.current_node_id);
    
    // Check if the current node is invalid (not found or a start node with no edges)
    const isStuckOnStart = currentNode?.node_type === 'start' && 
      !edges.some(e => e.source_node_id === currentNode!.id);
    
    if (!currentNode || isStuckOnStart) {
      console.log('Session stuck on invalid/orphan node, resetting to valid start...');
      
      // Find the correct start node (with edges)
      const startNodes = nodes.filter(n => n.node_type === 'start');
      let validStartNode = null;
      for (const sn of startNodes) {
        if (edges.some(e => e.source_node_id === sn.id)) {
          validStartNode = sn;
          break;
        }
      }
      
      if (!validStartNode) {
        console.error('No valid start node found');
        return new Response(JSON.stringify({ error: 'No valid start node' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Reset session and walk from valid start
      const { messages, finalNodeId, collectedData: newData } = await walkFlowUntilInteractive(
        validStartNode.id,
        nodes,
        edges,
        {},
        flowBot
      );
      
      // Update session with corrected node
      await supabase
        .from('flow_sessions')
        .update({ 
          current_node_id: finalNodeId,
          collected_data: newData,
          status: 'active'
        })
        .eq('id', session.id);
      
      console.log(`Session reset: sending ${messages.length} message(s), stopping at node ${finalNodeId}`);
      
      return respondWithMessages(messages);
    }

    console.log('Current node type:', currentNode.node_type, 'data:', currentNode.data);

    // Handle input based on current node type
    let nextNodeId: string | null = null;
    let collectedData = { ...session.collected_data };

    if (currentNode.node_type === 'buttons') {
      // Check if user clicked a button (by number, label, or value)
      const buttons = currentNode.data.buttons || [];
      let selectedButton = null;

      // First, check if user typed a number (1, 2, 3...)
      const numberInput = parseInt(message_text.trim());
      if (!isNaN(numberInput) && numberInput >= 1 && numberInput <= buttons.length) {
        selectedButton = buttons[numberInput - 1];
        console.log('User selected button by number:', numberInput, '->', selectedButton);
      } else {
        // Check by label or value
        selectedButton = buttons.find(
          b => b.label.toLowerCase().includes(message_text.toLowerCase()) ||
               b.value.toLowerCase() === message_text.toLowerCase() ||
               message_text.toLowerCase().includes(b.value.toLowerCase())
        );
      }

      if (selectedButton) {
        console.log('Button matched:', selectedButton);
        
        // Find edge for this button using source_handle
        const buttonEdge = edges.find(
          e => e.source_node_id === currentNode.id && 
               (e.source_handle === selectedButton.id || e.source_handle === selectedButton.value)
        );
        
        if (buttonEdge) {
          nextNodeId = buttonEdge.target_node_id;
          console.log('Found button edge to:', nextNodeId);
        } else {
          // Fall back to default edge (no source_handle)
          const defaultEdge = edges.find(e => e.source_node_id === currentNode.id && !e.source_handle);
          nextNodeId = defaultEdge?.target_node_id || null;
          console.log('Using default edge to:', nextNodeId);
        }
      } else if (flowBot.ai_fallback_enabled) {
        // User sent something unexpected - use AI fallback
        const aiResponse = await getAiFallbackResponse(
          message_text, 
          currentNode.data.message || '',
          buttons.map(b => b.label),
          flowBot.ai_fallback_message
        );
        
        return respondWithMessages([{
            message: aiResponse,
            buttons: buttons.map(b => ({ label: b.label, value: b.value }))
          }]);
      } else {
        // No AI fallback - just repeat the question with buttons
        return respondWithMessages([{
            message: currentNode.data.message || 'Por favor, escolha uma opção:',
            buttons: buttons.map(b => ({ label: b.label, value: b.value }))
          }]);
      }
    } else if (currentNode.node_type === 'collect_data') {
      // Validate and collect data
      const variableName = currentNode.data.variable_name || 'input';
      const variableType = currentNode.data.variable_type || 'text';
      
      const isValid = validateInput(message_text, variableType);
      
      if (isValid) {
        collectedData[variableName] = message_text;
        console.log('Collected data:', variableName, '=', message_text);
        
        // Find next node
        const nextEdge = edges.find(e => e.source_node_id === currentNode.id);
        nextNodeId = nextEdge?.target_node_id || null;
      } else if (flowBot.ai_fallback_enabled) {
        // Invalid input - AI helps explain
        const aiResponse = await getAiFallbackResponse(
          message_text,
          currentNode.data.message || '',
          [],
          flowBot.ai_fallback_message,
          `O usuário deveria ter informado um ${variableType}, mas digitou: "${message_text}". ${currentNode.data.validation_message || 'Peça educadamente para informar um valor válido.'}`
        );
        
        return respondWithMessages([{ message: aiResponse }]);
      } else {
        // No AI - use validation message
        return respondWithMessages([{ 
            message: currentNode.data.validation_message || 'Por favor, informe um valor válido.'
          }]);
      }
    } else if (currentNode.node_type === 'message') {
      // For message nodes, any input advances to next
      const nextEdge = edges.find(e => e.source_node_id === currentNode.id);
      nextNodeId = nextEdge?.target_node_id || null;
    }

    // Move to next node and continue walking
    if (nextNodeId) {
      const { messages, finalNodeId, collectedData: finalData, transfer, flowComplete } = await walkFlowUntilInteractive(
        nextNodeId,
        nodes,
        edges,
        collectedData,
        flowBot
      );

      // Update session
      if (flowComplete) {
        await supabase
          .from('flow_sessions')
          .update({ 
            status: 'completed',
            collected_data: finalData
          })
          .eq('id', session.id);
      } else if (transfer) {
        await supabase
          .from('flow_sessions')
          .update({ 
            status: 'transferred',
            collected_data: finalData
          })
          .eq('id', session.id);
      } else {
        await supabase
          .from('flow_sessions')
          .update({ 
            current_node_id: finalNodeId,
            collected_data: finalData
          })
          .eq('id', session.id);
      }

      console.log(`Advanced session: sending ${messages.length} message(s), final node ${finalNodeId}`);

      return respondWithMessages(messages, { transfer, collected_data: finalData });
    }

    // No next node - flow complete
    await supabase
      .from('flow_sessions')
      .update({ status: 'completed' })
      .eq('id', session.id);

    return new Response(JSON.stringify({
      response_type: 'flow_complete',
      collected_data: collectedData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Flow bot error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Walk through the flow from a starting node until we hit an interactive node
 * (buttons, collect_data) or end the flow (action node).
 * Returns all messages collected along the way.
 */
async function walkFlowUntilInteractive(
  startNodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
  initialData: Record<string, string>,
  flowBot: { ai_fallback_message?: string }
): Promise<{
  messages: FlowMessage[];
  finalNodeId: string;
  collectedData: Record<string, string>;
  transfer?: boolean;
  flowComplete?: boolean;
}> {
  const messages: FlowMessage[] = [];
  let currentNodeId = startNodeId;
  let collectedData = { ...initialData };
  let transfer = false;
  let flowComplete = false;
  let iterations = 0;
  const MAX_ITERATIONS = 20; // Prevent infinite loops

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    const currentNode = nodes.find(n => n.id === currentNodeId);
    if (!currentNode) {
      console.log('Node not found, ending walk');
      break;
    }

    console.log(`Walking node [${iterations}]: ${currentNode.node_type} - ${currentNode.data.label}`);

    switch (currentNode.node_type) {
      case 'start':
        // Start node: just move to next
        const startEdge = edges.find(e => e.source_node_id === currentNodeId);
        if (startEdge) {
          currentNodeId = startEdge.target_node_id;
        } else {
          // No next node
          flowComplete = true;
          return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
        }
        break;

      case 'message':
        // Message node: collect message and continue to next
        if (currentNode.data.message || currentNode.data.media_url) {
          const msg: FlowMessage = {
            message: replaceVariables(currentNode.data.message || '', collectedData)
          };
          if (currentNode.data.media_url) {
            msg.media_url = currentNode.data.media_url;
            msg.media_type = currentNode.data.media_type || 'audio';
          }
          messages.push(msg);
        }
        
        const messageEdge = edges.find(e => e.source_node_id === currentNodeId);
        if (messageEdge) {
          currentNodeId = messageEdge.target_node_id;
        } else {
          // No next node, stop here
          return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
        }
        break;

      case 'buttons':
        // Buttons node: add message with buttons and STOP (wait for user input)
        if (currentNode.data.message) {
          const buttons = (currentNode.data.buttons || []).map(b => ({
            label: replaceVariables(b.label, collectedData),
            value: b.value
          }));
          
          messages.push({
            message: replaceVariables(currentNode.data.message, collectedData),
            buttons: buttons
          });
        }
        // Stop here and wait for user to choose
        return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };

      case 'collect_data':
        // Collect data node: add message and STOP (wait for user input)
        if (currentNode.data.message) {
          messages.push({
            message: replaceVariables(currentNode.data.message, collectedData)
          });
        }
        // Stop here and wait for user input
        return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };

      case 'action':
        // Action node: process action and potentially end flow
        const actionType = currentNode.data.action_type;
        
        if (actionType === 'transfer') {
          if (currentNode.data.transfer_message) {
            messages.push({
              message: replaceVariables(currentNode.data.transfer_message, collectedData)
            });
          }
          transfer = true;
          flowComplete = true;
          return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
        } else if (actionType === 'end') {
          flowComplete = true;
          return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
        } else if (actionType === 'webhook') {
          // Fire webhook but continue (don't wait for response)
          if (currentNode.data.webhook_url) {
            try {
              fetch(currentNode.data.webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  collected_data: collectedData,
                  timestamp: new Date().toISOString()
                })
              }).catch(err => console.error('Webhook error:', err));
            } catch (err) {
              console.error('Webhook error:', err);
            }
          }
          // Continue to next node
          const webhookEdge = edges.find(e => e.source_node_id === currentNodeId);
          if (webhookEdge) {
            currentNodeId = webhookEdge.target_node_id;
          } else {
            flowComplete = true;
            return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
          }
        } else {
          // Unknown action, try to continue
          const actionEdge = edges.find(e => e.source_node_id === currentNodeId);
          if (actionEdge) {
            currentNodeId = actionEdge.target_node_id;
          } else {
            flowComplete = true;
            return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
          }
        }
        break;

      default:
        // Unknown node type, try to continue
        const defaultEdge = edges.find(e => e.source_node_id === currentNodeId);
        if (defaultEdge) {
          currentNodeId = defaultEdge.target_node_id;
        } else {
          return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
        }
    }
  }

  console.log('Max iterations reached');
  return { messages, finalNodeId: currentNodeId, collectedData, transfer, flowComplete };
}

function replaceVariables(text: string, data: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
  }
  return result;
}

function validateInput(input: string, type: string): boolean {
  const trimmed = input.trim();
  switch (type) {
    case 'number':
      return !isNaN(Number(trimmed.replace(/[^\d.,]/g, '')));
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    case 'phone':
      return /^[\d\s()+-]{8,}$/.test(trimmed);
    default:
      return trimmed.length > 0;
  }
}

async function getAiFallbackResponse(
  userMessage: string,
  originalQuestion: string,
  expectedOptions: string[],
  fallbackPrefix: string | undefined,
  extraContext?: string
): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  const prefix = fallbackPrefix || 'Desculpe, não entendi.';
  
  if (!lovableApiKey) {
    // No API key - return simple fallback
    if (expectedOptions.length > 0) {
      return `${prefix}\n\nPor favor, escolha uma das opções:\n${expectedOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    }
    return `${prefix}\n\n${originalQuestion}`;
  }

  try {
    const response = await fetch('https://api.lovable.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Você é um assistente de atendimento ao cliente amigável. O usuário saiu do fluxo de conversa esperado.

CONTEXTO:
- A pergunta original era: "${originalQuestion}"
${expectedOptions.length > 0 ? `- As opções esperadas eram: ${expectedOptions.map((o, i) => `${i + 1}. ${o}`).join(', ')}` : ''}
${extraContext ? `- Contexto adicional: ${extraContext}` : ''}

TAREFA:
1. Responda brevemente à dúvida/comentário do usuário se fizer sentido
2. Gentilmente redirecione para a pergunta original
3. Se houver opções, reapresente-as numeradas (1, 2, 3...)

Seja breve, amigável e natural. Máximo 2-3 frases.`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || prefix;
    }
  } catch (error) {
    console.error('AI fallback error:', error);
  }

  // Fallback if AI fails
  if (expectedOptions.length > 0) {
    return `${prefix}\n\nPor favor, escolha uma das opções:\n${expectedOptions.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
  }
  return `${prefix}\n\n${originalQuestion}`;
}

function getAudioMimeCandidates(mediaUrl: string): { mimeType: string; fileName: string }[] {
  const lowerUrl = mediaUrl.toLowerCase();

  if (lowerUrl.includes('.ogg')) {
    return [
      { mimeType: 'audio/ogg; codecs=opus', fileName: 'audio.ogg' },
      { mimeType: 'audio/ogg', fileName: 'audio.ogg' },
      { mimeType: 'audio/opus', fileName: 'audio.opus' },
      { mimeType: 'audio/mpeg', fileName: 'audio.mp3' },
    ];
  }

  if (lowerUrl.includes('.mp3')) {
    return [{ mimeType: 'audio/mpeg', fileName: 'audio.mp3' }];
  }

  if (lowerUrl.includes('.aac')) {
    return [{ mimeType: 'audio/aac', fileName: 'audio.aac' }];
  }

  return [
    { mimeType: 'audio/ogg; codecs=opus', fileName: 'audio.ogg' },
    { mimeType: 'audio/ogg', fileName: 'audio.ogg' },
    { mimeType: 'audio/mpeg', fileName: 'audio.mp3' },
  ];
}

async function uploadAudioToMetaAndGetId(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
): Promise<string | null> {
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      console.error('[FlowBot] Failed to download audio for direct upload:', mediaResponse.status, mediaUrl);
      return null;
    }

    const audioBuffer = await mediaResponse.arrayBuffer();
    const mimeCandidates = getAudioMimeCandidates(mediaUrl);

    for (const candidate of mimeCandidates) {
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', candidate.mimeType);
      formData.append('file', new Blob([audioBuffer], { type: candidate.mimeType }), candidate.fileName);

      const uploadResp = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const uploadText = await uploadResp.text();
      console.log('[FlowBot] Audio media upload attempt:', candidate.mimeType, uploadResp.status, uploadText);

      if (!uploadResp.ok) {
        continue;
      }

      try {
        const uploadJson = JSON.parse(uploadText);
        if (uploadJson?.id) {
          return uploadJson.id;
        }
      } catch {
        // Ignore parse errors and continue fallback attempts
      }
    }

    return null;
  } catch (error) {
    console.error('[FlowBot] Error uploading audio directly to Meta:', error);
    return null;
  }
}

/**
 * Send flow bot messages via Meta Cloud API and persist in whatsapp_messages.
 */
async function sendFlowMessages(
  messages: FlowMessage[],
  channelId: string,
  contactPhone: string,
  organizationId: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  messageDb: any
) {
  if (!messages.length) return;

  // Fetch channel details (access_token, app_name, phone)
  const { data: channel } = await supabase
    .from('channels')
    .select('access_token, app_name, phone, provider')
    .eq('id', channelId)
    .single();

  if (!channel?.access_token) {
    console.error('No channel access token for sending flow bot messages');
    return;
  }

  const phoneNumberId = channel.app_name || channel.phone?.replace(/\D/g, '');
  const cleanDestination = contactPhone.replace(/\D/g, '');

  for (const msg of messages) {
    try {
      // Send media message (audio, image, etc.)
      if (msg.media_url && msg.media_type) {
        const mediaBody: Record<string, unknown> = {
          messaging_product: 'whatsapp',
          to: cleanDestination,
          type: msg.media_type,
        };

        // Build media object based on type
        let mediaObj: Record<string, string> = { link: msg.media_url };

        if (msg.media_type === 'audio') {
          const mediaId = await uploadAudioToMetaAndGetId(phoneNumberId, channel.access_token, msg.media_url);
          if (mediaId) {
            mediaObj = { id: mediaId };
            console.log('[FlowBot] Audio uploaded to Meta successfully, sending by media id.');
          } else {
            console.warn('[FlowBot] Audio direct upload failed, falling back to public link send.');
          }
        } else if (msg.message) {
          mediaObj.caption = msg.message;
        }

        mediaBody[msg.media_type] = mediaObj;

        console.log('[FlowBot] Sending media:', msg.media_type, msg.media_url);
        const mediaResp = await fetch(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${channel.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mediaBody),
          }
        );
        const mediaResult = await mediaResp.json();
        const mediaWamId = mediaResult?.messages?.[0]?.id || `flow_media_${Date.now()}`;
        console.log('[FlowBot] Media send result:', mediaResp.status, JSON.stringify(mediaResult));

        // Persist media message on external DB
        await messageDb.from('whatsapp_messages').insert({
          channel_id: channelId,
          organization_id: organizationId,
          message_id: mediaWamId,
          sender_phone: channel.phone,
          message_type: msg.media_type,
          content: msg.message || `[${msg.media_type}]`,
          media_url: msg.media_url,
          direction: 'outbound',
          status: mediaResp.ok ? 'sent' : 'failed',
          metadata: { provider: 'meta', destination: contactPhone, flow_bot: true },
        });
        supabase.rpc('upsert_conversation_stats_manual', {
          _channel_id: channelId, _conversation_phone: contactPhone,
          _content: msg.message || `[${msg.media_type}]`, _direction: 'outbound',
          _is_read: null, _sender_name: null, _created_at: new Date().toISOString(),
        }).then(() => {}, () => {});

        // If audio + text message, send text separately after audio with a 5s delay
        if (msg.media_type === 'audio' && msg.message) {
          console.log('[FlowBot] Waiting 5s before sending text after audio...');
          await new Promise(r => setTimeout(r, 5000));
          await sendTextMessage(phoneNumberId, channel.access_token, cleanDestination, msg.message, channelId, organizationId, channel.phone, contactPhone, supabase, messageDb);
        }
      } else if (msg.message) {
        // Plain text message (or buttons formatted as text)
        let textContent = msg.message;
        if (msg.buttons?.length) {
          textContent += '\n\n' + msg.buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
        }
        await sendTextMessage(phoneNumberId, channel.access_token, cleanDestination, textContent, channelId, organizationId, channel.phone, contactPhone, supabase, messageDb);
      }

      // Small delay between messages for natural pacing
      if (messages.length > 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (err) {
      console.error('[FlowBot] Error sending message:', err);
    }
  }
}

async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string,
  channelId: string,
  organizationId: string,
  channelPhone: string,
  contactPhone: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  msgDb?: any
) {
  const db = msgDb || supabase;
  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );
  const result = await resp.json();
  const wamId = result?.messages?.[0]?.id || `flow_text_${Date.now()}`;
  console.log('[FlowBot] Text send result:', resp.status, JSON.stringify(result));

  await db.from('whatsapp_messages').insert({
    channel_id: channelId,
    organization_id: organizationId,
    message_id: wamId,
    sender_phone: channelPhone,
    message_type: 'text',
    content: text,
    direction: 'outbound',
    status: resp.ok ? 'sent' : 'failed',
    metadata: { provider: 'meta', destination: contactPhone, flow_bot: true },
  });
  supabase.rpc('upsert_conversation_stats_manual', {
    _channel_id: channelId, _conversation_phone: contactPhone,
    _content: text, _direction: 'outbound', _is_read: null,
    _sender_name: null, _created_at: new Date().toISOString(),
  }).then(() => {}, () => {});
}
