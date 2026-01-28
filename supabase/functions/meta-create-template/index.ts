import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: {
    body_text?: string[][];
    header_text?: string[];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

interface CreateTemplateRequest {
  name: string;
  content: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  channel_id: string;
  footer?: string;
  variables?: string[];
  variable_examples?: Record<string, string>;
  variable_mappings?: Record<string, string>;
  buttons?: Array<{
    type: 'quick_reply' | 'url' | 'phone';
    label: string;
    value: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    console.log('User authenticated:', userId);

    const body: CreateTemplateRequest = await req.json();
    const { name, content, category, channel_id, footer, variables, variable_examples, variable_mappings, buttons } = body;

    if (!name || !content || !channel_id) {
      return new Response(JSON.stringify({ 
        error: 'Dados incompletos',
        message: 'Nome, conteúdo e canal são obrigatórios'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get channel info with access token and WABA ID
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('id, name, waba_id, access_token, organization_id')
      .eq('id', channel_id)
      .eq('provider', 'meta')
      .single();

    if (channelError || !channel) {
      console.error('Channel error:', channelError);
      return new Response(JSON.stringify({ 
        error: 'Canal não encontrado',
        message: 'O canal selecionado não existe ou não é do tipo Meta'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!channel.waba_id || !channel.access_token) {
      return new Response(JSON.stringify({ 
        error: 'Canal não configurado',
        message: 'O canal não possui WABA ID ou Access Token configurados'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert [p1], [p2] format to {{1}}, {{2}} for Meta API
    let metaContent = content;
    const variableMatches = content.match(/\[p(\d+)\]/gi) || [];
    const uniqueVars = [...new Set(variableMatches.map(v => v.toLowerCase()))];
    
    uniqueVars.forEach(v => {
      const num = v.match(/\d+/)?.[0];
      if (num) {
        metaContent = metaContent.replace(new RegExp(`\\[p${num}\\]`, 'gi'), `{{${num}}}`);
      }
    });

    // Build template components for Meta API
    const components: TemplateComponent[] = [];

    // Body component (required)
    const bodyComponent: TemplateComponent = {
      type: 'BODY',
      text: metaContent,
    };

    // Add examples for variables if provided
    if (uniqueVars.length > 0 && variable_examples) {
      const exampleValues: string[] = [];
      uniqueVars.forEach(v => {
        const varName = v.replace('[', '').replace(']', '');
        exampleValues.push(variable_examples[varName] || 'exemplo');
      });
      bodyComponent.example = {
        body_text: [exampleValues],
      };
    }
    components.push(bodyComponent);

    // Footer component (optional)
    if (footer?.trim()) {
      components.push({
        type: 'FOOTER',
        text: footer.trim(),
      });
    }

    // Buttons component (optional)
    if (buttons && buttons.length > 0) {
      const metaButtons = buttons.map(btn => {
        if (btn.type === 'quick_reply') {
          return {
            type: 'QUICK_REPLY' as const,
            text: btn.label,
          };
        } else if (btn.type === 'url') {
          // Check if it's a dynamic URL (contains {{variable}})
          const isDynamic = btn.value.startsWith('{{') && btn.value.endsWith('}}');
          if (isDynamic) {
            // For dynamic URLs, we use a placeholder URL that the Meta API accepts
            // The actual URL will be provided at send time via template components
            return {
              type: 'URL' as const,
              text: btn.label,
              url: 'https://example.com/{{1}}', // Meta requires a valid URL pattern with variable
              example: ['https://example.com/sample-link'], // Example for Meta validation
            };
          }
          return {
            type: 'URL' as const,
            text: btn.label,
            url: btn.value,
          };
        } else {
          return {
            type: 'PHONE_NUMBER' as const,
            text: btn.label,
            phone_number: btn.value,
          };
        }
      });

      components.push({
        type: 'BUTTONS',
        buttons: metaButtons,
      });
    }

    // Prepare template name (Meta requires snake_case, lowercase, no special chars)
    const templateName = name
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 64);

    console.log('Creating template on Meta:', templateName);
    console.log('Components:', JSON.stringify(components, null, 2));

    // Create template via Meta Graph API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v18.0/${channel.waba_id}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${channel.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: templateName,
          category: category || 'UTILITY',
          language: 'pt_BR',
          components,
        }),
      }
    );

    const metaResult = await metaResponse.json();
    console.log('Meta API response:', metaResult);

    if (!metaResponse.ok) {
      console.error('Meta API error:', metaResult);
      const errorMessage = metaResult.error?.message || 'Erro ao criar template na Meta';
      const errorCode = metaResult.error?.code;
      const errorSubcode = metaResult.error?.error_subcode;
      const errorUserTitle = metaResult.error?.error_user_title;
      const errorUserMsg = metaResult.error?.error_user_msg;
      
      // Handle specific error codes - prefer user-friendly messages from Meta when available
      let userMessage = errorUserMsg || errorUserTitle || errorMessage;
      
      if (errorCode === 100) {
        if (errorSubcode === 3835016) {
          // Account blocked from creating templates
          userMessage = errorUserMsg || 'Esta conta do WhatsApp Business está bloqueada para criar novos templates. Verifique as restrições da conta no Meta Business Suite.';
        } else if (errorSubcode === 2388109) {
          // Template name already exists
          userMessage = 'Um template com este nome já existe. Use um nome diferente.';
        } else if (!errorUserMsg) {
          userMessage = 'Nome de template já existe ou é inválido. Use apenas letras minúsculas, números e underscores.';
        }
      } else if (errorCode === 190) {
        userMessage = 'Token de acesso expirado ou inválido. Reconecte o canal.';
      } else if (errorCode === 131026) {
        userMessage = 'A conta atingiu o limite de templates. Delete alguns templates antigos antes de criar novos.';
      }

      return new Response(JSON.stringify({ 
        error: 'Erro Meta API',
        message: userMessage,
        details: metaResult.error
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Template created on Meta, now save to our database
    const { data: newTemplate, error: insertError } = await supabase
      .from('message_templates')
      .insert({
        user_id: userId,
        organization_id: channel.organization_id,
        name: templateName,
        content: content, // Keep original format with [p1], [p2]
        variables: variables || [],
        variable_mappings: variable_mappings || {},
        dispatch_type: 'utility', // Default, will show as universal in UI
        status: 'pending', // Awaiting Meta approval
        components: components, // Store Meta components
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Erro ao salvar template',
        message: 'Template criado na Meta mas erro ao salvar no sistema'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create channel_template association
    if (newTemplate) {
      await supabase.from('channel_templates').insert({
        channel_id: channel_id,
        template_id: newTemplate.id,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Template enviado para análise da Meta!',
      template_id: newTemplate?.id,
      meta_template_id: metaResult.id,
      status: 'pending',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Create template error:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro interno',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
