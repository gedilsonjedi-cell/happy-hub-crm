// reconcile-unread
// Rotina periódica que zera unread_count em conversation_stats (banco EXTERNO)
// quando a conversa já foi efetivamente "vista/respondida" e o contador ficou preso.
//
// Regras de reconciliação (conservadoras — só zera quando temos certeza):
//   1. assignment.status = 'archived'                          → zera
//   2. assignment.assigned_to IS NOT NULL
//      AND last_message_at > last_inbound_at + 2s              → agente respondeu após o último inbound
//   3. assignment.status IN ('resolved','closed')              → zera
//
// Auth:
//   - Bearer token de super_admin (uso manual)  OU
//   - x-cron-secret = RECONCILE_CRON_SECRET     (chamada via pg_cron)
//
// Body (opcional): { organization_id?: string, dry_run?: boolean, limit?: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface StatRow {
  id: string;
  assignment_id: string | null;
  organization_id: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
}

interface AssignmentRow {
  id: string;
  status: string | null;
  assigned_to: string | null;
}

const GRACE_MS = 2000; // 2s de tolerância entre last_inbound e last_message

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'POST/GET only' }, 405);

  try {
    // ---- Auth ----
    const cronSecret = Deno.env.get('RECONCILE_CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    let isCron = false;
    if (cronSecret && providedSecret && providedSecret === cronSecret) {
      isCron = true;
    } else {
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
    }

    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};
    const targetOrg: string | undefined = body.organization_id;
    const dryRun: boolean = body.dry_run === true;
    const hardLimit: number = Math.min(Number(body.limit) || 50000, 200000);

    const ext = getExternalDb();

    // ---- 1) Carregar todos os stats com unread_count > 0 ----
    const stats: StatRow[] = [];
    const pageSize = 1000;
    let from = 0;
    while (stats.length < hardLimit) {
      let q = ext.from('conversation_stats')
        .select('id, assignment_id, organization_id, unread_count, last_message_at, last_inbound_at')
        .gt('unread_count', 0)
        .order('updated_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (targetOrg) q = q.eq('organization_id', targetOrg);
      const { data, error } = await q;
      if (error) return json({ error: 'stats read: ' + error.message }, 500);
      if (!data || data.length === 0) break;
      stats.push(...(data as StatRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (stats.length === 0) {
      return json({ success: true, scanned: 0, reset: 0, reasons: {}, dry_run: dryRun, mode: isCron ? 'cron' : 'manual' });
    }

    // ---- 2) Buscar os assignments correspondentes em lote ----
    const assignmentIds = Array.from(
      new Set(stats.map(s => s.assignment_id).filter((v): v is string => !!v))
    );
    const assignmentsMap = new Map<string, AssignmentRow>();
    for (let i = 0; i < assignmentIds.length; i += 1000) {
      const slice = assignmentIds.slice(i, i + 1000);
      const { data, error } = await ext.from('conversation_assignments')
        .select('id, status, assigned_to')
        .in('id', slice);
      if (error) return json({ error: 'assignments read: ' + error.message }, 500);
      for (const a of (data || []) as AssignmentRow[]) assignmentsMap.set(a.id, a);
    }

    // ---- 3) Decidir quais zerar ----
    const toReset: string[] = [];
    const reasons: Record<string, number> = { archived: 0, resolved: 0, agent_replied_after_inbound: 0 };

    for (const s of stats) {
      if (!s.assignment_id) continue;
      const a = assignmentsMap.get(s.assignment_id);
      if (!a) continue;

      let reason: keyof typeof reasons | null = null;
      const status = (a.status || '').toLowerCase();

      if (status === 'archived') reason = 'archived';
      else if (status === 'resolved' || status === 'closed') reason = 'resolved';
      else if (
        a.assigned_to &&
        s.last_message_at &&
        (!s.last_inbound_at ||
          new Date(s.last_message_at).getTime() > new Date(s.last_inbound_at).getTime() + GRACE_MS)
      ) {
        reason = 'agent_replied_after_inbound';
      }

      if (reason) {
        toReset.push(s.id);
        reasons[reason]++;
      }
    }

    // ---- 4) Aplicar (em lotes de 500) ----
    let reset = 0;
    if (!dryRun && toReset.length > 0) {
      for (let i = 0; i < toReset.length; i += 500) {
        const slice = toReset.slice(i, i + 500);
        const { error, data } = await ext.from('conversation_stats')
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .in('id', slice)
          .gt('unread_count', 0)
          .select('id');
        if (error) return json({ error: 'reset: ' + error.message, partial_reset: reset }, 500);
        reset += data?.length || 0;
      }
    }

    return json({
      success: true,
      scanned: stats.length,
      candidates: toReset.length,
      reset,
      reasons,
      dry_run: dryRun,
      mode: isCron ? 'cron' : 'manual',
      organization_id: targetOrg ?? null,
    });
  } catch (err) {
    console.error('[reconcile-unread]', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
