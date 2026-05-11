// diag-unread-divergence
// Compara contagens de "Novos" (fila de espera) vs "Não Lidos" reais vs persistidos
// no banco EXTERNO. Retorna divergências por organização (e opcionalmente por usuário).
//
// Auth: super_admin obrigatório.
// Body: { organization_id?: string }  -> se omitido, varre todas as orgs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface AssignmentRow {
  id: string;
  organization_id: string;
  conversation_phone: string;
  channel_id: string | null;
  assigned_to: string | null;
  status: string | null;
}

interface StatRow {
  assignment_id: string;
  unread_count: number | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
}

interface OrgReport {
  organization_id: string;
  organization_name?: string | null;
  total_active: number;
  novos: number;            // pending + sem dono + truly unread
  unread_real: number;      // last_inbound_at >= last_message_at
  unread_persisted: number; // unread_count > 0
  divergence_real_vs_persisted: number;
  divergence_novos_gt_unread: number; // ALERTA: deveria ser 0 (Novos é subconjunto)
  per_user: Array<{
    user_id: string | null;
    unread_real: number;
    unread_persisted: number;
    divergence: number;
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const internalService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(internalUrl, internalAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const svc = createClient(internalUrl, internalService);
    const { data: roleRow } = await svc.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
    if (!roleRow) return json({ error: 'super_admin required' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetOrg: string | undefined = body.organization_id;

    const ext = getExternalDb();

    // Fetch active assignments (paginated)
    const assignments: AssignmentRow[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let q = ext.from('conversation_assignments')
        .select('id, organization_id, conversation_phone, channel_id, assigned_to, status')
        .neq('status', 'archived')
        .range(from, from + pageSize - 1);
      if (targetOrg) q = q.eq('organization_id', targetOrg);
      const { data, error } = await q;
      if (error) return json({ error: 'assignments: ' + error.message }, 500);
      if (!data || data.length === 0) break;
      assignments.push(...(data as AssignmentRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // Fetch matching stats by assignment_id (chunked)
    const statsByAssignment = new Map<string, StatRow>();
    const ids = assignments.map(a => a.id);
    const chunk = 500;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const { data, error } = await ext.from('conversation_stats')
        .select('assignment_id, unread_count, last_message_at, last_inbound_at')
        .in('assignment_id', slice);
      if (error) return json({ error: 'stats: ' + error.message }, 500);
      for (const r of (data || []) as StatRow[]) {
        statsByAssignment.set(r.assignment_id, r);
      }
    }

    // Org names (internal)
    const orgIds = Array.from(new Set(assignments.map(a => a.organization_id))).filter(Boolean);
    const orgNames = new Map<string, string>();
    if (orgIds.length) {
      const { data: orgs } = await svc.from('organizations').select('id, name').in('id', orgIds);
      for (const o of (orgs || []) as { id: string; name: string }[]) orgNames.set(o.id, o.name);
    }

    // Aggregate
    const reports = new Map<string, OrgReport>();
    const perUserMap = new Map<string, Map<string, { unread_real: number; unread_persisted: number }>>();

    const isTrulyUnread = (s?: StatRow) => {
      if (!s?.last_inbound_at) return false;
      const inb = new Date(s.last_inbound_at).getTime();
      const last = s.last_message_at ? new Date(s.last_message_at).getTime() : 0;
      return inb >= last;
    };

    for (const a of assignments) {
      const orgId = a.organization_id;
      if (!reports.has(orgId)) {
        reports.set(orgId, {
          organization_id: orgId,
          organization_name: orgNames.get(orgId) || null,
          total_active: 0,
          novos: 0,
          unread_real: 0,
          unread_persisted: 0,
          divergence_real_vs_persisted: 0,
          divergence_novos_gt_unread: 0,
          per_user: [],
        });
        perUserMap.set(orgId, new Map());
      }
      const r = reports.get(orgId)!;
      const stat = statsByAssignment.get(a.id);
      const truly = isTrulyUnread(stat);
      const persisted = (stat?.unread_count || 0) > 0;

      r.total_active++;
      if (truly) r.unread_real++;
      if (persisted) r.unread_persisted++;
      if (truly !== persisted) r.divergence_real_vs_persisted++;

      const isWaitingNew = (a.status === 'pending') && !a.assigned_to && truly;
      if (isWaitingNew) r.novos++;

      const userKey = a.assigned_to || '__unassigned__';
      const users = perUserMap.get(orgId)!;
      if (!users.has(userKey)) users.set(userKey, { unread_real: 0, unread_persisted: 0 });
      const u = users.get(userKey)!;
      if (truly) u.unread_real++;
      if (persisted) u.unread_persisted++;
    }

    // Finalize
    for (const [orgId, r] of reports) {
      r.divergence_novos_gt_unread = Math.max(0, r.novos - r.unread_real);
      const users = perUserMap.get(orgId)!;
      r.per_user = Array.from(users.entries())
        .map(([user_id, v]) => ({
          user_id: user_id === '__unassigned__' ? null : user_id,
          unread_real: v.unread_real,
          unread_persisted: v.unread_persisted,
          divergence: Math.abs(v.unread_real - v.unread_persisted),
        }))
        .filter(u => u.divergence > 0 || u.unread_real > 0)
        .sort((a, b) => b.divergence - a.divergence);
    }

    const list = Array.from(reports.values())
      .sort((a, b) => (b.divergence_real_vs_persisted + b.divergence_novos_gt_unread)
                    - (a.divergence_real_vs_persisted + a.divergence_novos_gt_unread));

    const alerts = list.filter(r =>
      r.divergence_real_vs_persisted > 0 || r.divergence_novos_gt_unread > 0
    );

    return json({
      success: true,
      generated_at: new Date().toISOString(),
      total_orgs_scanned: list.length,
      total_alerts: alerts.length,
      reports: list,
    });
  } catch (err) {
    console.error('[diag-unread-divergence]', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
