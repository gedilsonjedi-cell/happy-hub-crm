// Backfill incremental: copia conversation_assignments + conversation_stats
// do banco INTERNO pro EXTERNO. Idempotente (upsert por id).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const internal = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BATCH = 500;

async function backfillAssignments(offset: number) {
  const ext = getExternalDb();
  const { data, error } = await internal
    .from('conversation_assignments')
    .select('id,channel_id,conversation_phone,assigned_to,status,sector_id,lead_id,is_bot_handling,campaign_chatbot_id,bot_paused_until,created_at,updated_at')
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH - 1);
  if (error) throw error;
  if (!data?.length) return 0;

  const channelIds = [...new Set(data.map(r => r.channel_id).filter(Boolean) as string[])];
  const leadIds = [...new Set(data.filter(r => !r.channel_id && r.lead_id).map(r => r.lead_id) as string[])];
  const orgByChannel: Record<string, string> = {};
  const orgByLead: Record<string, string> = {};
  if (channelIds.length) {
    const { data: chans } = await internal.from('channels').select('id,organization_id').in('id', channelIds);
    chans?.forEach((c: any) => { if (c.organization_id) orgByChannel[c.id] = c.organization_id; });
  }
  if (leadIds.length) {
    const { data: leads } = await internal.from('leads').select('id,organization_id').in('id', leadIds);
    leads?.forEach((l: any) => { if (l.organization_id) orgByLead[l.id] = l.organization_id; });
  }

  const enriched = data
    .map((r: any) => ({
      ...r,
      organization_id: r.channel_id ? orgByChannel[r.channel_id] : (r.lead_id ? orgByLead[r.lead_id] : null),
    }))
    .filter((r: any) => r.organization_id);

  if (enriched.length) {
    const { error: upErr } = await ext.from('conversation_assignments').upsert(enriched, { onConflict: 'id' });
    if (upErr) throw upErr;
  }
  return data.length;
}

async function backfillStats(offset: number) {
  const ext = getExternalDb();
  const { data, error } = await internal
    .from('conversation_stats')
    .select('id,assignment_id,channel_id,conversation_phone,organization_id,last_message_content,last_message_at,last_inbound_at,unread_count,sender_name,updated_at')
    .order('updated_at', { ascending: true })
    .range(offset, offset + BATCH - 1);
  if (error) throw error;
  if (!data?.length) return 0;

  const missing = data.filter((r: any) => !r.organization_id && r.channel_id);
  if (missing.length) {
    const channelIds = [...new Set(missing.map((r: any) => r.channel_id))] as string[];
    const { data: chans } = await internal.from('channels').select('id,organization_id').in('id', channelIds);
    const map: Record<string, string> = {};
    chans?.forEach((c: any) => { if (c.organization_id) map[c.id] = c.organization_id; });
    missing.forEach((r: any) => { r.organization_id = map[r.channel_id] ?? null; });
  }

  const filtered = data.filter((r: any) => r.organization_id && r.assignment_id);
  if (filtered.length) {
    const { error: upErr } = await ext.from('conversation_stats').upsert(filtered, { onConflict: 'assignment_id' });
    if (upErr) throw upErr;
  }
  return data.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const table = (url.searchParams.get('table') || 'assignments') as 'assignments' | 'stats';
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const maxBatches = parseInt(url.searchParams.get('max_batches') || '40', 10);

    let processed = 0;
    let cur = offset;
    for (let i = 0; i < maxBatches; i++) {
      const n = table === 'stats' ? await backfillStats(cur) : await backfillAssignments(cur);
      if (n === 0) break;
      processed += n;
      cur += n;
      if (n < BATCH) break;
    }

    return new Response(JSON.stringify({ ok: true, table, processed, next_offset: cur }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[backfill]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
