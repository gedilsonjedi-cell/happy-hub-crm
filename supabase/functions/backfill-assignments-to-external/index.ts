// Backfill incremental: copia conversation_assignments + conversation_stats
// do banco INTERNO pro EXTERNO. Idempotente (upsert por id).
// Pode ser chamada múltiplas vezes; processa em lotes de 500.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '@supabase/supabase-js/cors';
import { getExternalDb } from '../_shared/externalDb.ts';

const internal = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BATCH = 500;

async function backfillAssignments(offset: number) {
  const ext = getExternalDb();
  const { data, error } = await internal
    .from('conversation_assignments')
    .select('id,organization_id,channel_id,conversation_phone,assigned_to,status,sector_id,lead_id,is_bot_handling,campaign_chatbot_id,bot_paused_until,created_at,updated_at')
    .order('created_at', { ascending: true })
    .range(offset, offset + BATCH - 1);
  if (error) throw error;
  if (!data?.length) return 0;
  const filtered = data.filter(r => r.organization_id);
  if (filtered.length) {
    const { error: upErr } = await ext.from('conversation_assignments').upsert(filtered, { onConflict: 'id' });
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
  const filtered = data.filter(r => r.organization_id && r.assignment_id);
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
    const maxBatches = parseInt(url.searchParams.get('max_batches') || '20', 10);

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
