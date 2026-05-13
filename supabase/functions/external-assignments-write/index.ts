// external-assignments-write
// Centraliza TODAS as mutations de conversation_assignments e conversation_stats
// no banco EXTERNO (master). Substitui escritas diretas no interno.
//
// Operações suportadas (action no body):
//   - upsert_assignment       : cria/atualiza assignment
//   - update_assignment_status: muda status (pending/in_progress/archived/etc)
//   - assign_to               : atribui a um atendente
//   - transfer                : transfere setor + atendente
//   - archive                 : status='archived'
//   - restore                 : status='in_progress'
//   - reset_unread            : zera unread_count
//   - upsert_stats            : chama RPC upsert_conversation_stats_external
//
// Auth: requer JWT válido do usuário logado (interno). Validamos via
// supabase-js do interno e extraímos organization_id do profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getExternalDb } from '../_shared/externalDb.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface AssignmentPayload {
  organization_id?: string;
  channel_id?: string | null;
  conversation_phone?: string;
  assigned_to?: string | null;
  status?: string;
  sector_id?: string | null;
  lead_id?: string | null;
  is_bot_handling?: boolean;
  campaign_chatbot_id?: string | null;
  bot_paused_until?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    // Validate caller via internal supabase
    const internalUrl = Deno.env.get('SUPABASE_URL')!;
    const internalAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const internalService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authClient = createClient(internalUrl, internalAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Get caller's organization_id (super_admin can pass impersonatedOrgId)
    const svc = createClient(internalUrl, internalService);
    const { data: profile } = await svc.from('profiles')
      .select('organization_id').eq('user_id', user.id).maybeSingle();

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    if (!action) return json({ error: 'Missing action' }, 400);

    // org resolution
    let orgId: string | null = profile?.organization_id ?? null;
    if (body.impersonatedOrgId) {
      const { data: roleRow } = await svc.from('user_roles')
        .select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
      if (roleRow) orgId = body.impersonatedOrgId;
    }
    if (!orgId) return json({ error: 'No organization' }, 403);

    const ext = getExternalDb();

    switch (action) {
      case 'upsert_assignment': {
        const p: AssignmentPayload = body.payload || {};
        if (!p.conversation_phone) return json({ error: 'conversation_phone required' }, 400);
        const row = {
          organization_id: orgId,
          channel_id: p.channel_id ?? null,
          conversation_phone: p.conversation_phone,
          assigned_to: p.assigned_to ?? null,
          status: p.status ?? 'pending',
          sector_id: p.sector_id ?? null,
          lead_id: p.lead_id ?? null,
          is_bot_handling: p.is_bot_handling ?? false,
          campaign_chatbot_id: p.campaign_chatbot_id ?? null,
          bot_paused_until: p.bot_paused_until ?? null,
          updated_at: new Date().toISOString(),
        };
        // Try upsert by (channel_id, conversation_phone)
        const { data, error } = await ext.from('conversation_assignments')
          .upsert(row, { onConflict: 'channel_id,conversation_phone' })
          .select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment: data });
      }

      case 'update_assignment_status':
      case 'assign_to':
      case 'transfer':
      case 'update_by_phone': {
        const id = body.id;
        const channelId = body.channel_id;
        const phone = body.phone || body.conversation_phone;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) updates.status = body.status;
        if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
        if (body.assigned_at !== undefined) updates.assigned_at = body.assigned_at;
        if (body.sector_id !== undefined) updates.sector_id = body.sector_id;
        if (body.lead_id !== undefined) updates.lead_id = body.lead_id;
        if (body.is_bot_handling !== undefined) updates.is_bot_handling = body.is_bot_handling;
        if (body.bot_paused_until !== undefined) updates.bot_paused_until = body.bot_paused_until;

        let q = ext.from('conversation_assignments').update(updates).eq('organization_id', orgId);
        if (id) {
          q = q.eq('id', id);
        } else if (channelId && phone) {
          const norm = String(phone).replace(/\D/g, '');
          const variants = new Set<string>([norm, `+${norm}`]);
          if (norm.startsWith('55') && norm.length >= 12) {
            const ddd = norm.slice(2, 4);
            const local = norm.slice(4);
            if (local.length === 9 && local.startsWith('9')) {
              variants.add(`55${ddd}${local.slice(1)}`);
              variants.add(`+55${ddd}${local.slice(1)}`);
            } else if (local.length === 8) {
              variants.add(`55${ddd}9${local}`);
              variants.add(`+55${ddd}9${local}`);
            }
          }
          const suffix8 = norm.slice(-8);
          const exactFilter = Array.from(variants).map((p) => `conversation_phone.eq.${p}`);
          const fallbackFilter = suffix8 ? [`conversation_phone.ilike.%${suffix8}`] : [];
          q = q.eq('channel_id', channelId).or([...exactFilter, ...fallbackFilter].join(','));
        } else {
          return json({ error: 'id or (channel_id+phone) required' }, 400);
        }
        const { data, error } = await q.select();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment: data });
      }

      case 'read_assignment_by_phone': {
        const channelId = body.channel_id;
        const phone = body.phone || body.conversation_phone;
        if (!channelId || !phone) return json({ error: 'channel_id+phone required' }, 400);
        const norm = String(phone).replace(/\D/g, '');
        const { data, error } = await ext.from('conversation_assignments')
          .select('id, assigned_to, sector_id, status, lead_id, channel_id, conversation_phone')
          .eq('organization_id', orgId)
          .eq('channel_id', channelId)
          .or(`conversation_phone.eq.${norm},conversation_phone.eq.+${norm}`)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment: data });
      }

      case 'archive': {
        const { error } = await ext.rpc('archive_conversation_ext', {
          p_channel_id: body.channel_id, p_phone: body.phone,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case 'restore': {
        const { error } = await ext.rpc('restore_conversation_ext', {
          p_channel_id: body.channel_id, p_phone: body.phone,
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case 'reset_unread': {
        const channelId = body.channel_id;
        const phone = body.phone || body.conversation_phone;
        if (!channelId || !phone) return json({ error: 'channel_id+phone required' }, 400);
        const norm = String(phone).replace(/\D/g, '');
        if (!norm) return json({ error: 'valid phone required' }, 400);
        const baseVariants = Array.isArray(body.phone_variants) && body.phone_variants.length
          ? body.phone_variants.map((p: unknown) => String(p).replace(/\D/g, '')).filter(Boolean)
          : [norm];
        const suffixes = Array.from(new Set(baseVariants.map((p: string) => p.slice(-8)).filter(Boolean)));

        const { data, error } = await ext.from('conversation_stats')
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('channel_id', channelId)
          .in('conversation_phone', Array.from(new Set([...baseVariants, ...baseVariants.map((p: string) => `+${p}`)])))
          .select('id');
        if (error) return json({ error: error.message }, 500);

        if (!data?.length && suffixes.length) {
          const orFilter = suffixes.map((suffix: string) => `conversation_phone.ilike.%${suffix}`).join(',');
          const { error: fallbackError } = await ext.from('conversation_stats')
            .update({ unread_count: 0, updated_at: new Date().toISOString() })
            .eq('organization_id', orgId)
            .eq('channel_id', channelId)
            .or(orFilter);
          if (fallbackError) return json({ error: fallbackError.message }, 500);
        }

        return json({ success: true });
      }

      case 'upsert_stats': {
        const { data, error } = await ext.rpc('upsert_conversation_stats_external', {
          _organization_id: orgId,
          _channel_id: body.channel_id,
          _conversation_phone: body.conversation_phone,
          _content: body.content ?? '',
          _direction: body.direction,
          _is_read: body.is_read ?? false,
          _sender_name: body.sender_name ?? null,
          _created_at: body.created_at ?? new Date().toISOString(),
        });
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment_id: data });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[external-assignments-write]', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
