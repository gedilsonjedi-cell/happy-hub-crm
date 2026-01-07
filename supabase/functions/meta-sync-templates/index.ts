import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: {
      body_text?: string[][];
    };
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    // Create supabase client with the user's auth header
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate token using getClaims
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);

    if (authError || !claimsData?.claims) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;
    console.log('User authenticated:', userId, userEmail);

    // Check if organization_id was passed in the request body (for SuperAdmins impersonating)
    let organizationId: string | null = null;
    
    try {
      const body = await req.json();
      if (body.organization_id) {
        organizationId = body.organization_id;
        console.log('Organization ID from request body:', organizationId);
      }
    } catch {
      // No body or invalid JSON, continue normally
    }

    // If no organization_id in body, check user's role and profile
    if (!organizationId) {
      // Check if user is super_admin
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const isSuperAdmin = userRole?.role === 'super_admin';
      console.log('User role:', userRole?.role, 'Is SuperAdmin:', isSuperAdmin);

      if (isSuperAdmin) {
        // SuperAdmin without organization_id - they need to select one via impersonation
        return new Response(JSON.stringify({ 
          error: 'Organization required',
          message: 'Selecione uma organização para sincronizar'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Regular user - get organization from profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      console.log('Profile lookup result:', { profile, profileError });

      if (profileError || !profile?.organization_id) {
        console.error('Organization not found for user:', userId);
        return new Response(JSON.stringify({ 
          error: 'Organization not found',
          message: 'Usuário não está associado a uma organização'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      organizationId = profile.organization_id;
    }

    console.log('Using organization:', organizationId);

    // Get all Meta channels with access tokens for the organization
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, name, phone, waba_id, access_token')
      .eq('organization_id', organizationId)
      .eq('provider', 'meta')
      .eq('connected', true)
      .not('access_token', 'is', null)
      .not('waba_id', 'is', null);

    if (channelsError) {
      console.error('Error fetching channels:', channelsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch channels' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No connected Meta channels found',
        message: 'Nenhum canal Meta conectado com WABA configurado'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found channels:', channels.length);

    // Group channels by WABA ID (same WABA shares templates)
    const wabaGroups: Record<string, { waba_id: string; access_token: string; channel_ids: string[] }> = {};
    
    for (const channel of channels) {
      if (!channel.waba_id || !channel.access_token) continue;
      
      if (!wabaGroups[channel.waba_id]) {
        wabaGroups[channel.waba_id] = {
          waba_id: channel.waba_id,
          access_token: channel.access_token,
          channel_ids: [],
        };
      }
      wabaGroups[channel.waba_id].channel_ids.push(channel.id);
    }

    console.log('WABA groups:', Object.keys(wabaGroups).length);

    let totalSynced = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    const syncedTemplates: Array<{ name: string; status: string; waba_id: string }> = [];

    // Fetch templates for each WABA
    for (const wabaGroup of Object.values(wabaGroups)) {
      try {
        console.log('Fetching templates for WABA:', wabaGroup.waba_id);
        
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${wabaGroup.waba_id}/message_templates?limit=250`,
          {
            headers: {
              'Authorization': `Bearer ${wabaGroup.access_token}`,
            },
          }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          console.error('Meta API error:', response.status, errorBody);
          continue;
        }

        const data = await response.json();
        const metaTemplates: MetaTemplate[] = data.data || [];

        console.log('Found templates from Meta:', metaTemplates.length);

        for (const metaTemplate of metaTemplates) {
          // Extract body content from components
          const bodyComponent = metaTemplate.components?.find(c => c.type === 'BODY');
          const content = bodyComponent?.text || '';
          
          // Map Meta status to our status
          let status: 'pending' | 'approved' | 'rejected' = 'pending';
          if (metaTemplate.status === 'APPROVED') {
            status = 'approved';
          } else if (metaTemplate.status === 'REJECTED' || metaTemplate.status === 'DISABLED') {
            status = 'rejected';
          }

          // Map category to dispatch_type
          let dispatch_type: 'marketing' | 'utility' | 'service' = 'utility';
          if (metaTemplate.category === 'MARKETING') {
            dispatch_type = 'marketing';
          } else if (metaTemplate.category === 'UTILITY') {
            dispatch_type = 'utility';
          } else if (metaTemplate.category === 'AUTHENTICATION') {
            dispatch_type = 'service';
          }

          // Extract variables from content
          const variableRegex = /\{\{(\d+)\}\}/g;
          const variables: string[] = [];
          let match;
          while ((match = variableRegex.exec(content)) !== null) {
            variables.push(`VAR_${match[1]}`);
          }

          // Check if template already exists by name for this organization
          const { data: existingTemplate } = await supabase
            .from('message_templates')
            .select('id')
            .eq('name', metaTemplate.name)
            .eq('organization_id', organizationId)
            .single();

          if (existingTemplate) {
            // Update existing template
            const { error: updateError } = await supabase
              .from('message_templates')
              .update({
                content,
                status,
                dispatch_type,
                variables,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingTemplate.id);

            if (!updateError) {
              totalUpdated++;
              
              // Ensure channel_templates exist for all channels in this WABA
              for (const channelId of wabaGroup.channel_ids) {
                const { data: existingCT } = await supabase
                  .from('channel_templates')
                  .select('id')
                  .eq('channel_id', channelId)
                  .eq('template_id', existingTemplate.id)
                  .single();

                if (!existingCT) {
                  await supabase.from('channel_templates').insert({
                    channel_id: channelId,
                    template_id: existingTemplate.id,
                  });
                }
              }
            }
          } else {
            // Create new template
            const { data: newTemplate, error: insertError } = await supabase
              .from('message_templates')
              .insert({
                user_id: userId,
                organization_id: organizationId,
                name: metaTemplate.name,
                content,
                status,
                dispatch_type,
                variables,
              })
              .select('id')
              .single();

            if (!insertError && newTemplate) {
              totalCreated++;
              
              // Create channel_templates for all channels in this WABA
              for (const channelId of wabaGroup.channel_ids) {
                await supabase.from('channel_templates').insert({
                  channel_id: channelId,
                  template_id: newTemplate.id,
                });
              }
            }
          }

          syncedTemplates.push({
            name: metaTemplate.name,
            status: metaTemplate.status,
            waba_id: wabaGroup.waba_id,
          });
          totalSynced++;
        }
      } catch (error) {
        console.error('Error processing WABA:', wabaGroup.waba_id, error);
      }
    }

    console.log('Sync completed:', { totalSynced, totalCreated, totalUpdated });

    return new Response(JSON.stringify({
      success: true,
      message: `Sincronização concluída: ${totalCreated} novos, ${totalUpdated} atualizados`,
      stats: {
        total: totalSynced,
        created: totalCreated,
        updated: totalUpdated,
      },
      templates: syncedTemplates,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
