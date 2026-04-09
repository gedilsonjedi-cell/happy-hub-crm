import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Extract Bearer token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401, headers });
    }
    const apiToken = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve channel by api_token
    const { data: channels, error: chErr } = await supabase.rpc('get_channel_by_api_token', { _token: apiToken });
    if (chErr || !channels || channels.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid API token or channel not connected' }), { status: 401, headers });
    }
    const channel = channels[0];
    const organizationId = channel.organization_id;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'Channel has no organization' }), { status: 400, headers });
    }

    const url = new URL(req.url);

    // ─── GET: List all tags/labels for the organization ───
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('lead_tags')
        .select('id, name, color')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) {
        console.error('[manage-labels] Query error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch labels' }), { status: 500, headers });
      }

      return new Response(JSON.stringify({ data: data || [] }), { status: 200, headers });
    }

    // ─── POST: Create label OR assign labels to a contact ───
    if (req.method === 'POST') {
      const body = await req.json();

      // If contact_id is provided, assign tags to the contact
      if (body.contact_id) {
        const { contact_id, tags } = body;

        if (!tags || !Array.isArray(tags)) {
          return new Response(JSON.stringify({ error: '"tags" array is required' }), { status: 400, headers });
        }

        // Get the contact's current tags
        const { data: lead, error: leadErr } = await supabase
          .from('leads')
          .select('tags')
          .eq('id', contact_id)
          .eq('organization_id', organizationId)
          .single();

        if (leadErr || !lead) {
          return new Response(JSON.stringify({ error: 'Contact not found' }), { status: 404, headers });
        }

        // Merge existing tags with new ones (unique)
        const currentTags: string[] = lead.tags || [];
        const mergedTags = [...new Set([...currentTags, ...tags])];

        const { error: updateErr } = await supabase
          .from('leads')
          .update({ tags: mergedTags })
          .eq('id', contact_id)
          .eq('organization_id', organizationId);

        if (updateErr) {
          return new Response(JSON.stringify({ error: 'Failed to assign labels' }), { status: 500, headers });
        }

        return new Response(JSON.stringify({ success: true, tags: mergedTags }), { status: 200, headers });
      }

      // Create a new label/tag
      const { name, color } = body;
      if (!name) {
        return new Response(JSON.stringify({ error: '"name" is required' }), { status: 400, headers });
      }

      const { data, error } = await supabase
        .from('lead_tags')
        .insert({
          name,
          color: color || '#6366f1',
          organization_id: organizationId,
        })
        .select('id, name, color')
        .single();

      if (error) {
        console.error('[manage-labels] Insert error:', error);
        return new Response(JSON.stringify({ error: 'Failed to create label', details: error.message }), { status: 500, headers });
      }

      return new Response(JSON.stringify({ data }), { status: 201, headers });
    }

    // ─── DELETE: Remove label from contact or delete label ───
    if (req.method === 'DELETE') {
      const contactId = url.searchParams.get('contact_id');
      const labelId = url.searchParams.get('label_id');
      const tagName = url.searchParams.get('tag');

      // Remove a tag from a contact
      if (contactId && tagName) {
        const { data: lead, error: leadErr } = await supabase
          .from('leads')
          .select('tags')
          .eq('id', contactId)
          .eq('organization_id', organizationId)
          .single();

        if (leadErr || !lead) {
          return new Response(JSON.stringify({ error: 'Contact not found' }), { status: 404, headers });
        }

        const currentTags: string[] = lead.tags || [];
        const updatedTags = currentTags.filter(t => t !== tagName);

        const { error: updateErr } = await supabase
          .from('leads')
          .update({ tags: updatedTags })
          .eq('id', contactId)
          .eq('organization_id', organizationId);

        if (updateErr) {
          return new Response(JSON.stringify({ error: 'Failed to remove label' }), { status: 500, headers });
        }

        return new Response(JSON.stringify({ success: true, tags: updatedTags }), { status: 200, headers });
      }

      // Delete a label entirely
      if (labelId) {
        const { error } = await supabase
          .from('lead_tags')
          .delete()
          .eq('id', labelId)
          .eq('organization_id', organizationId);

        if (error) {
          return new Response(JSON.stringify({ error: 'Failed to delete label' }), { status: 500, headers });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Provide contact_id+tag or label_id' }), { status: 400, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  } catch (err) {
    console.error('[manage-labels] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
});
