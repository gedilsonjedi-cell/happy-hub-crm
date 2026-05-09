// mirror-to-external
// Recebe payloads dos triggers internos (pg_net) e replica writes
// (INSERT/UPDATE/DELETE) em conversation_assignments / conversation_stats
// no banco EXTERNO usando service role.
//
// Body: { table: 'conversation_assignments'|'conversation_stats',
//         op: 'INSERT'|'UPDATE'|'DELETE', new?: row, old?: row }
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TABLES = new Set(['conversation_assignments', 'conversation_stats']);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Strip fields that shouldn't be propagated (e.g. internal-only generated)
function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  // The id is the same UUID across both DBs after backfill; keep it.
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const table = String(body?.table || '');
  const op = String(body?.op || '').toUpperCase();
  if (!ALLOWED_TABLES.has(table)) return json({ error: 'table not allowed' }, 400);
  if (!['INSERT', 'UPDATE', 'DELETE'].includes(op)) return json({ error: 'bad op' }, 400);

  try {
    const ext = getExternalDb();

    if (op === 'INSERT' || op === 'UPDATE') {
      const row = sanitize(body.new || {});
      if (!row.id) return json({ error: 'missing id' }, 400);
      const { error } = await ext.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.error('[mirror] upsert', table, error.message, { id: row.id });
        return json({ error: error.message }, 500);
      }
    } else if (op === 'DELETE') {
      const id = body.old?.id;
      if (!id) return json({ error: 'missing old.id' }, 400);
      const { error } = await ext.from(table).delete().eq('id', id);
      if (error) {
        console.error('[mirror] delete', table, error.message, { id });
        return json({ error: error.message }, 500);
      }
    }
    return json({ success: true });
  } catch (err) {
    console.error('[mirror-to-external] fatal', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
