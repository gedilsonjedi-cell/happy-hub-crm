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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Get or create session
    let { data: session } = await supabase
      .from('flow_sessions')
      .select('*')
      .eq('flow_bot_id', flow_bot_id)
      .eq('channel_id', channel_id)
      .eq('contact_phone', contact_phone)
      .eq('status', 'active')
      .maybeSingle();

    if (!session) {
      // Find start node
      const startNode = nodes.find(n => n.node_type === 'start');
      if (!startNode) {
        return new Response(JSON.stringify({ error: 'No start node' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create new session
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

      // Send initial flow - find next node after start
      const nextEdge = edges.find(e => e.source_node_id === startNode.id);
      if (nextEdge) {
        const nextNode = nodes.find(n => n.id === nextEdge.target_node_id);
        if (nextNode) {
          const response = await processNode(nextNode, session, supabase);
          
          // Update session to next node
          await supabase
            .from('flow_sessions')
            .update({ current_node_id: nextNode.id })
            .eq('id', session.id);

          return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Process user input based on current node
    const currentNode = nodes.find(n => n.id === session.current_node_id);
    
    if (!currentNode) {
      return new Response(JSON.stringify({ error: 'Current node not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle input based on current node type
    let nextNodeId: string | null = null;
    let collectedData = { ...session.collected_data };

    if (currentNode.node_type === 'buttons') {
      // Check if user clicked a button
      const buttons = currentNode.data.buttons || [];
      const selectedButton = buttons.find(
        b => b.label.toLowerCase() === message_text.toLowerCase() ||
             b.value.toLowerCase() === message_text.toLowerCase()
      );

      if (selectedButton) {
        // Find edge for this button
        const buttonEdge = edges.find(
          e => e.source_node_id === currentNode.id && 
               (e.source_handle === selectedButton.id || e.source_handle === selectedButton.value)
        );
        
        if (buttonEdge) {
          nextNodeId = buttonEdge.target_node_id;
        } else {
          // Fall back to default edge
          const defaultEdge = edges.find(e => e.source_node_id === currentNode.id && !e.source_handle);
          nextNodeId = defaultEdge?.target_node_id || null;
        }
      } else if (flowBot.ai_fallback_enabled) {
        // User sent something unexpected - use AI fallback
        const aiResponse = await getAiFallbackResponse(
          message_text, 
          currentNode.data.message || '',
          buttons.map(b => b.label),
          flowBot.ai_fallback_message
        );
        
        return new Response(JSON.stringify({
          response_type: 'ai_fallback',
          message: aiResponse,
          buttons: buttons.map(b => b.label),
          original_question: currentNode.data.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // No AI fallback - just repeat the question
        return new Response(JSON.stringify({
          response_type: 'repeat',
          message: currentNode.data.message,
          buttons: buttons.map(b => b.label)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (currentNode.node_type === 'collect_data') {
      // Validate and collect data
      const variableName = currentNode.data.variable_name || 'input';
      const variableType = currentNode.data.variable_type || 'text';
      
      const isValid = validateInput(message_text, variableType);
      
      if (isValid) {
        collectedData[variableName] = message_text;
        
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
        
        return new Response(JSON.stringify({
          response_type: 'ai_fallback',
          message: aiResponse,
          original_question: currentNode.data.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // No AI - use validation message
        return new Response(JSON.stringify({
          response_type: 'validation_error',
          message: currentNode.data.validation_message || 'Por favor, informe um valor válido.',
          original_question: currentNode.data.message
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (currentNode.node_type === 'message') {
      // For message nodes, any input advances to next
      const nextEdge = edges.find(e => e.source_node_id === currentNode.id);
      nextNodeId = nextEdge?.target_node_id || null;
    }

    // Move to next node
    if (nextNodeId) {
      const nextNode = nodes.find(n => n.id === nextNodeId);
      
      if (nextNode) {
        // Update session
        await supabase
          .from('flow_sessions')
          .update({ 
            current_node_id: nextNodeId,
            collected_data: collectedData
          })
          .eq('id', session.id);

        // Process next node
        const response = await processNode(nextNode, { ...session, collected_data: collectedData }, supabase);
        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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

async function processNode(node: FlowNode, session: FlowSession, supabase: any) {
  const message = replaceVariables(node.data.message || '', session.collected_data);
  
  switch (node.node_type) {
    case 'message':
      return {
        response_type: 'message',
        message: message
      };
    
    case 'buttons':
      return {
        response_type: 'buttons',
        message: message,
        buttons: (node.data.buttons || []).map(b => ({
          label: replaceVariables(b.label, session.collected_data),
          value: b.value
        }))
      };
    
    case 'collect_data':
      return {
        response_type: 'collect_data',
        message: message,
        variable_name: node.data.variable_name,
        variable_type: node.data.variable_type
      };
    
    case 'action':
      return await processAction(node, session, supabase);
    
    default:
      return { response_type: 'unknown' };
  }
}

async function processAction(node: FlowNode, session: FlowSession, supabase: any) {
  const actionType = node.data.action_type;
  
  switch (actionType) {
    case 'transfer':
      // Mark session as transferred
      await supabase
        .from('flow_sessions')
        .update({ status: 'transferred' })
        .eq('id', session.id);
      
      return {
        response_type: 'transfer',
        message: replaceVariables(node.data.transfer_message || 'Transferindo para atendente...', session.collected_data),
        transfer: true,
        collected_data: session.collected_data
      };
    
    case 'webhook':
      if (node.data.webhook_url) {
        try {
          await fetch(node.data.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: session.id,
              collected_data: session.collected_data,
              timestamp: new Date().toISOString()
            })
          });
        } catch (err) {
          console.error('Webhook error:', err);
        }
      }
      return {
        response_type: 'webhook_sent',
        collected_data: session.collected_data
      };
    
    case 'end':
      await supabase
        .from('flow_sessions')
        .update({ status: 'completed' })
        .eq('id', session.id);
      
      return {
        response_type: 'flow_complete',
        collected_data: session.collected_data
      };
    
    default:
      return { response_type: 'unknown_action' };
  }
}

function replaceVariables(text: string, data: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'gi'), value);
    result = result.replace(new RegExp(`{${key}}`, 'gi'), value);
  }
  return result;
}

function validateInput(input: string, type: string): boolean {
  switch (type) {
    case 'number':
      return !isNaN(Number(input.replace(/[^\d.,]/g, '')));
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
    case 'phone':
      return /^[\d\s()+-]{8,}$/.test(input);
    default:
      return input.trim().length > 0;
  }
}

async function getAiFallbackResponse(
  userMessage: string,
  originalQuestion: string,
  expectedOptions: string[],
  fallbackPrefix: string,
  extraContext?: string
): Promise<string> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey) {
    // No API key - return simple fallback
    if (expectedOptions.length > 0) {
      return `${fallbackPrefix}\n\nPor favor, escolha uma das opções:\n${expectedOptions.map(o => `• ${o}`).join('\n')}`;
    }
    return `${fallbackPrefix}\n\n${originalQuestion}`;
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
${expectedOptions.length > 0 ? `- As opções esperadas eram: ${expectedOptions.join(', ')}` : ''}
${extraContext ? `- Contexto adicional: ${extraContext}` : ''}

TAREFA:
1. Responda brevemente à dúvida/comentário do usuário se fizer sentido
2. Gentilmente redirecione para a pergunta original
3. Se houver opções, reapresente-as

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
      return data.choices?.[0]?.message?.content || fallbackPrefix;
    }
  } catch (error) {
    console.error('AI fallback error:', error);
  }

  // Fallback if AI fails
  if (expectedOptions.length > 0) {
    return `${fallbackPrefix}\n\nPor favor, escolha uma das opções:\n${expectedOptions.map(o => `• ${o}`).join('\n')}`;
  }
  return `${fallbackPrefix}\n\n${originalQuestion}`;
}
