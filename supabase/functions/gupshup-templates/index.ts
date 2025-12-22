import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { apiKey, appName, channelId } = await req.json();

    if (!apiKey || !appName) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key e App Name são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching templates from Gupshup for app:', appName);

    // Fetch templates from Gupshup API
    const gupshupResponse = await fetch(
      `https://api.gupshup.io/wa/app/${appName}/template`,
      {
        method: 'GET',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Gupshup templates API response status:', gupshupResponse.status);

    if (gupshupResponse.status === 401) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais inválidas. Verifique sua API Key.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!gupshupResponse.ok) {
      const errorText = await gupshupResponse.text();
      console.error('Gupshup templates API error:', errorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Erro ao buscar templates do Gupshup' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const templatesData = await gupshupResponse.json();
    console.log('Gupshup templates data:', JSON.stringify(templatesData));

    // Parse templates from Gupshup response
    const templates = templatesData.templates || templatesData.data || [];
    
    // Filter only approved templates
    const approvedTemplates = templates.filter((t: any) => 
      t.status === 'APPROVED' || t.status === 'approved'
    );

    console.log(`Found ${approvedTemplates.length} approved templates`);

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    const syncedTemplates = [];

    // Sync each template to the database
    for (const template of approvedTemplates) {
      const templateName = template.elementName || template.name || template.id;
      const templateContent = template.data || template.body || template.content || '';
      const category = template.category || template.templateType || 'utility';
      
      // Map Gupshup category to our dispatch_type
      let dispatchType: 'marketing' | 'utility' | 'service' = 'utility';
      if (category.toLowerCase().includes('marketing')) {
        dispatchType = 'marketing';
      } else if (category.toLowerCase().includes('service') || category.toLowerCase().includes('otp')) {
        dispatchType = 'service';
      }

      // Extract variables from template content (format: {{1}}, {{2}}, etc.)
      const variableMatches = templateContent.match(/\{\{(\d+)\}\}/g) || [];
      const variables = variableMatches.map((v: string) => v.replace(/[{}]/g, ''));

      // Check if template already exists
      const { data: existingTemplate } = await supabase
        .from('message_templates')
        .select('id')
        .eq('name', templateName)
        .eq('user_id', user.id)
        .single();

      if (existingTemplate) {
        // Update existing template
        await supabase
          .from('message_templates')
          .update({
            content: templateContent,
            dispatch_type: dispatchType,
            status: 'approved',
            variables: variables,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingTemplate.id);

        syncedTemplates.push({ name: templateName, action: 'updated' });
      } else {
        // Create new template
        const { error: insertError } = await supabase
          .from('message_templates')
          .insert({
            user_id: user.id,
            organization_id: profile?.organization_id,
            name: templateName,
            content: templateContent,
            dispatch_type: dispatchType,
            status: 'approved',
            variables: variables
          });

        if (!insertError) {
          syncedTemplates.push({ name: templateName, action: 'created' });
        }
      }

      // If channelId provided, link template to channel
      if (channelId) {
        const { data: newTemplate } = await supabase
          .from('message_templates')
          .select('id')
          .eq('name', templateName)
          .eq('user_id', user.id)
          .single();

        if (newTemplate) {
          // Check if channel_template link exists
          const { data: existingLink } = await supabase
            .from('channel_templates')
            .select('id')
            .eq('channel_id', channelId)
            .eq('template_id', newTemplate.id)
            .single();

          if (!existingLink) {
            await supabase
              .from('channel_templates')
              .insert({
                channel_id: channelId,
                template_id: newTemplate.id
              });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${syncedTemplates.length} templates sincronizados com sucesso!`,
        templates: syncedTemplates,
        totalFound: templates.length,
        approved: approvedTemplates.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in gupshup-templates:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno ao sincronizar templates' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
