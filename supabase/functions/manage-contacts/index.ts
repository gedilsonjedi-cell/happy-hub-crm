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

    // ─── GET: List / search contacts ───
    if (req.method === 'GET') {
      const search = url.searchParams.get('search') || '';
      const stage = url.searchParams.get('stage') || '';
      const contactId = url.searchParams.get('contact_id') || '';
      const page = parseInt(url.searchParams.get('page') || '1', 10);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const offset = (page - 1) * limit;

      // Single contact by ID
      if (contactId) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, name, phone, email, status, tags, notes, city, state, document, stage_id, created_at')
          .eq('id', contactId)
          .eq('organization_id', organizationId)
          .single();

        if (error || !data) {
          return new Response(JSON.stringify({ error: 'Contact not found' }), { status: 404, headers });
        }

        // Resolve stage name
        let stageName: string | null = null;
        if (data.stage_id) {
          const { data: stageData } = await supabase
            .from('pipeline_stages')
            .select('name')
            .eq('id', data.stage_id)
            .single();
          stageName = stageData?.name || null;
        }

        return new Response(JSON.stringify({
          data: { ...data, stage: stageName },
        }), { status: 200, headers });
      }

      // List with filters
      let query = supabase
        .from('leads')
        .select('id, name, phone, email, status, tags, notes, stage_id, created_at', { count: 'exact' })
        .eq('organization_id', organizationId);

      if (search) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      }

      // Filter by stage name
      if (stage) {
        // Look up stage id by name
        const { data: stageData } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', stage);

        if (stageData && stageData.length > 0) {
          const stageIds = stageData.map((s: { id: string }) => s.id);
          query = query.in('stage_id', stageIds);
        } else {
          // No matching stage, return empty
          return new Response(JSON.stringify({ data: [], total: 0, page, limit }), { status: 200, headers });
        }
      }

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('[manage-contacts] Query error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch contacts' }), { status: 500, headers });
      }

      // Resolve stage names for all results
      const stageIds = [...new Set((data || []).filter((d: any) => d.stage_id).map((d: any) => d.stage_id))];
      let stageMap: Record<string, string> = {};
      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from('pipeline_stages')
          .select('id, name')
          .in('id', stageIds);
        if (stages) {
          stageMap = Object.fromEntries(stages.map((s: any) => [s.id, s.name]));
        }
      }

      const enriched = (data || []).map((d: any) => ({
        ...d,
        stage: d.stage_id ? stageMap[d.stage_id] || null : null,
      }));

      return new Response(JSON.stringify({
        data: enriched,
        total: count || 0,
        page,
        limit,
      }), { status: 200, headers });
    }

    // ─── POST: Create contact ───
    if (req.method === 'POST') {
      const body = await req.json();
      const { name, phone, email, tags, notes, stage } = body;

      if (!name || !phone) {
        return new Response(JSON.stringify({ error: '"name" and "phone" are required' }), { status: 400, headers });
      }

      // Resolve stage name to id if provided
      let stageId: string | null = null;
      if (stage) {
        const { data: stageData } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('organization_id', organizationId)
          .ilike('name', stage)
          .limit(1)
          .single();
        stageId = stageData?.id || null;
      }

      const { data, error } = await supabase
        .from('leads')
        .insert({
          name,
          phone: phone.replace(/\D/g, ''),
          email: email || null,
          tags: tags || null,
          notes: notes || null,
          stage_id: stageId,
          organization_id: organizationId,
          status: 'active',
        })
        .select('id, name, phone, email, tags, notes, stage_id, created_at')
        .single();

      if (error) {
        console.error('[manage-contacts] Insert error:', error);
        return new Response(JSON.stringify({ error: 'Failed to create contact', details: error.message }), { status: 500, headers });
      }

      return new Response(JSON.stringify({ data: { ...data, stage: stage || null } }), { status: 201, headers });
    }

    // ─── PUT: Update contact ───
    if (req.method === 'PUT') {
      const contactId = url.searchParams.get('contact_id');
      if (!contactId) {
        return new Response(JSON.stringify({ error: 'contact_id query param is required' }), { status: 400, headers });
      }

      const body = await req.json();
      const updateData: Record<string, unknown> = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.phone !== undefined) updateData.phone = body.phone.replace(/\D/g, '');
      if (body.email !== undefined) updateData.email = body.email;
      if (body.tags !== undefined) updateData.tags = body.tags;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.status !== undefined) updateData.status = body.status;

      // Handle stage change by name
      if (body.stage !== undefined) {
        if (body.stage === null || body.stage === '') {
          updateData.stage_id = null;
        } else {
          const { data: stageData } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('organization_id', organizationId)
            .ilike('name', body.stage)
            .limit(1)
            .single();
          if (stageData) {
            updateData.stage_id = stageData.id;
          } else {
            return new Response(JSON.stringify({ error: `Stage "${body.stage}" not found` }), { status: 400, headers });
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers });
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .select('id, name, phone, email, tags, notes, stage_id, created_at')
        .single();

      if (error) {
        console.error('[manage-contacts] Update error:', error);
        return new Response(JSON.stringify({ error: 'Failed to update contact' }), { status: 500, headers });
      }

      return new Response(JSON.stringify({ data }), { status: 200, headers });
    }

    // ─── DELETE: Remove contact ───
    if (req.method === 'DELETE') {
      const contactId = url.searchParams.get('contact_id');
      if (!contactId) {
        return new Response(JSON.stringify({ error: 'contact_id query param is required' }), { status: 400, headers });
      }

      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', contactId)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('[manage-contacts] Delete error:', error);
        return new Response(JSON.stringify({ error: 'Failed to delete contact' }), { status: 500, headers });
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  } catch (err) {
    console.error('[manage-contacts] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers });
  }
});
