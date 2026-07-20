// debug-duplicate-assignments
// TEMP: identifica linhas duplicadas em conversation_assignments (mesmo channel_id
// + mesmo sufixo de 8 dígitos do telefone) no banco EXTERNO, para diagnóstico
// do problema "dois atendentes atendendo a mesma conversa".
//
// Body: { organizationId: string, phone?: string }
import { getExternalDb } from '../_shared/externalDb.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const orgId = body.organizationId;
  const phone = body.phone ? String(body.phone).replace(/\D/g, '') : null;
  if (!orgId) return new Response(JSON.stringify({ error: 'organizationId required' }), { status: 400, headers: cors });

  const ext = getExternalDb();

  // Buscar tudo da org (limitado a 5000) e agrupar por (channel_id, sufixo 8)
  let q = ext.from('conversation_assignments')
    .select('id, channel_id, conversation_phone, assigned_to, status, sector_id, updated_at, created_at')
    .eq('organization_id', orgId)
    .limit(5000);
  if (phone) {
    const suffix = phone.slice(-8);
    q = q.ilike('conversation_phone', `%${suffix}`);
  }
  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  const groups = new Map<string, any[]>();
  for (const r of data ?? []) {
    const digits = String(r.conversation_phone ?? '').replace(/\D/g, '');
    const key = `${r.channel_id}|${digits.slice(-8)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const duplicates = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, rows }));

  return new Response(
    JSON.stringify({ total_scanned: data?.length ?? 0, duplicate_groups: duplicates.length, duplicates }, null, 2),
    { headers: { ...cors, 'Content-Type': 'application/json' } }
  );
});
