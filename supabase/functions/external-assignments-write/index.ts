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

function normalizePhoneThreadValue(phone: string): string {
  // Web Chat: identificador de sessão, nunca vira telefone.
  const raw = String(phone || '').replace(/^\+(?=webchat:)/, '');
  if (raw.startsWith('webchat:')) return raw;
  const normalized = String(phone || '').replace(/\D/g, '');
  if (!normalized) return '';
  if (normalized.length <= 11 && !normalized.startsWith('55')) return `55${normalized}`;
  return normalized;
}

function getPhoneThreadVariants(phone: string): string[] {
  const normalized = normalizePhoneThreadValue(phone);
  if (!normalized) return [];
  if (normalized.startsWith('webchat:')) return [normalized];

  const variants = new Set<string>([normalized]);
  if (normalized.startsWith('55') && normalized.length >= 10) {
    const withoutCountry = normalized.slice(2);
    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      variants.add(`55${areaCode}${localNumber.slice(1)}`);
    } else if (localNumber.length === 8) {
      variants.add(`55${areaCode}9${localNumber}`);
    }
  }

  return Array.from(variants);
}

function getPhoneLookupVariants(phone: string): string[] {
  const variants = new Set<string>();
  for (const variant of getPhoneThreadVariants(phone)) {
    variants.add(variant);
    if (variant.startsWith('webchat:')) continue;
    variants.add(`+${variant}`);
  }
  return Array.from(variants);
}

function buildPhoneMatch(phone: string): { normalized: string; filter: string } {
  const normalized = normalizePhoneThreadValue(phone);
  if (normalized.startsWith('webchat:')) return { normalized, filter: `conversation_phone.eq."${normalized}"` };
  const exactFilter = getPhoneLookupVariants(normalized).map((value) => `conversation_phone.eq.${value}`);
  const suffix8 = normalized.slice(-8);
  const fallbackFilter = suffix8 ? [`conversation_phone.ilike.%${suffix8}`] : [];
  return { normalized, filter: [...exactFilter, ...fallbackFilter].join(',') };
}

function pickAssignmentRow(rows: Array<Record<string, any>>, preferredUserId?: string | null) {
  return [...rows].sort((a, b) => {
    if (preferredUserId) {
      if (a.assigned_to === preferredUserId && b.assigned_to !== preferredUserId) return -1;
      if (b.assigned_to === preferredUserId && a.assigned_to !== preferredUserId) return 1;
    }
    if (!!a.assigned_to !== !!b.assigned_to) return a.assigned_to ? -1 : 1;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  })[0] || null;
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

    const { data: roleRows } = await svc.from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    const callerRoles = new Set((roleRows || []).map((row: { role: string }) => row.role));
    const canOverrideAssignment = ['super_admin', 'admin', 'supervisor'].some((role) => callerRoles.has(role));

    // org resolution
    let orgId: string | null = profile?.organization_id ?? null;
    if (body.impersonatedOrgId) {
      if (callerRoles.has('super_admin')) orgId = body.impersonatedOrgId;
    }
    if (!orgId) return json({ error: 'No organization' }, 403);

    const ext = getExternalDb();

    switch (action) {
      case 'upsert_assignment': {
        const p: AssignmentPayload = body.payload || {};
        if (!p.conversation_phone) return json({ error: 'conversation_phone required' }, 400);
        if (p.assigned_to && p.assigned_to !== user.id && !canOverrideAssignment) {
          return json({ error: 'Only admins or supervisors can assign another attendant' }, 403);
        }
        const { normalized, filter } = buildPhoneMatch(p.conversation_phone);
        const insertRow = {
          organization_id: orgId,
          channel_id: p.channel_id ?? null,
          conversation_phone: normalized,
          assigned_to: p.assigned_to ?? null,
          status: p.status ?? 'pending',
          sector_id: p.sector_id ?? null,
          lead_id: p.lead_id ?? null,
          is_bot_handling: p.is_bot_handling ?? false,
          campaign_chatbot_id: p.campaign_chatbot_id ?? null,
          bot_paused_until: p.bot_paused_until ?? null,
          updated_at: new Date().toISOString(),
        };

        if (p.channel_id && filter) {
          const { data: existingRows, error: lookupError } = await ext.from('conversation_assignments')
            .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
            .eq('organization_id', orgId)
            .eq('channel_id', p.channel_id)
            .or(filter)
            .limit(10);
          if (lookupError) return json({ error: lookupError.message }, 500);

          if (existingRows?.length) {
            const ownerConflict = existingRows.find((row: any) => row.assigned_to && p.assigned_to && row.assigned_to !== p.assigned_to);
            if (ownerConflict && !canOverrideAssignment) {
              return json({ success: false, error: 'already_assigned', assignment: ownerConflict }, 200);
            }

            const target = pickAssignmentRow(existingRows, p.assigned_to ?? user.id);
            const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (p.assigned_to !== undefined) updates.assigned_to = p.assigned_to;
            if (p.status !== undefined) updates.status = p.status;
            if (p.sector_id !== undefined) updates.sector_id = p.sector_id;
            if (p.lead_id !== undefined) updates.lead_id = p.lead_id;
            if (p.is_bot_handling !== undefined) updates.is_bot_handling = p.is_bot_handling;
            if (p.campaign_chatbot_id !== undefined) updates.campaign_chatbot_id = p.campaign_chatbot_id;
            if (p.bot_paused_until !== undefined) updates.bot_paused_until = p.bot_paused_until;

            const { data, error } = await ext.from('conversation_assignments')
              .update(updates)
              .eq('id', target.id)
              .eq('organization_id', orgId)
              .select().single();
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, assignment: data });
          }
        }

        // Sem channel_id não há constraint única que proteja: buscar por
        // variantes/sufixo na organização antes de criar. Erro de leitura
        // ABORTA (nunca cria linha nova — isso duplicaria a conversa).
        if (!p.channel_id && filter) {
          const { data: orphanRows, error: orphanErr } = await ext.from('conversation_assignments')
            .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
            .eq('organization_id', orgId)
            .is('channel_id', null)
            .or(filter)
            .limit(10);
          if (orphanErr) return json({ error: orphanErr.message }, 500);
          const target = pickAssignmentRow(orphanRows || [], p.assigned_to ?? user.id);
          if (target) {
            const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (p.assigned_to !== undefined) updates.assigned_to = p.assigned_to;
            if (p.status !== undefined) updates.status = p.status;
            if (p.sector_id !== undefined) updates.sector_id = p.sector_id;
            if (p.lead_id !== undefined) updates.lead_id = p.lead_id;
            const { data, error } = await ext.from('conversation_assignments')
              .update(updates).eq('id', target.id).eq('organization_id', orgId)
              .select().single();
            if (error) return json({ error: error.message }, 500);
            return json({ success: true, assignment: data });
          }
        }

        const { data, error } = await ext.from('conversation_assignments')
          .upsert(insertRow, { onConflict: 'channel_id,conversation_phone' })
          .select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment: data });
      }

      // Atomic claim: acquire ownership ONLY if currently unassigned (or already mine).
      // Prevents two attendants from "winning" the same conversation on concurrent clicks.
      case 'claim_assignment': {
        const p: AssignmentPayload = body.payload || {};
        if (!p.conversation_phone || !p.channel_id) {
          return json({ error: 'conversation_phone + channel_id required' }, 400);
        }
        const userId = user.id;
        const nowIso = new Date().toISOString();
        const { normalized, filter } = buildPhoneMatch(p.conversation_phone);
        if (!normalized || !filter) return json({ error: 'valid conversation_phone required' }, 400);

        // Step 1: read every phone variant/suffix first. If any variant already
        // has a different owner, this conversation is locked to that owner.
        const { data: existingRows, error: lookupErr } = await ext.from('conversation_assignments')
          .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
          .eq('organization_id', orgId)
          .eq('channel_id', p.channel_id)
          .or(filter)
          .limit(10);
        if (lookupErr) return json({ error: lookupErr.message }, 500);

        const existingOwner = existingRows?.find((row: any) => row.assigned_to && row.assigned_to !== userId);
        if (existingOwner) {
          return json({ success: false, error: 'already_assigned', assignment: existingOwner }, 200);
        }

        const updates: Record<string, unknown> = {
          assigned_to: userId,
          status: p.status ?? 'active',
          updated_at: nowIso,
        };
        if (p.sector_id !== undefined && p.sector_id !== null) updates.sector_id = p.sector_id;
        if (p.lead_id !== undefined && p.lead_id !== null) updates.lead_id = p.lead_id;

        const target = pickAssignmentRow(existingRows || [], userId);
        if (target) {
          const { data: updated, error: updErr } = await ext.from('conversation_assignments')
            .update(updates)
            .eq('id', target.id)
            .eq('organization_id', orgId)
            .or(`assigned_to.is.null,assigned_to.eq.${userId}`)
            .select();
          if (updErr) return json({ error: updErr.message }, 500);

          if (updated && updated.length > 0) {
            return json({ success: true, assignment: updated[0], claimed: true });
          }

          const { data: racedRows } = await ext.from('conversation_assignments')
            .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
            .eq('organization_id', orgId)
            .eq('channel_id', p.channel_id)
            .or(filter)
            .limit(10);
          const racedOwner = racedRows?.find((row: any) => row.assigned_to && row.assigned_to !== userId);
          if (racedOwner) return json({ success: false, error: 'already_assigned', assignment: racedOwner }, 200);
          return json({ error: 'Unable to claim assignment' }, 409);
        }

        // No variant exists — insert fresh, taking ownership.
        const insertRow = {
          organization_id: orgId,
          channel_id: p.channel_id,
          conversation_phone: normalized,
          assigned_to: userId,
          status: p.status ?? 'active',
          sector_id: p.sector_id ?? null,
          lead_id: p.lead_id ?? null,
          is_bot_handling: false,
          updated_at: nowIso,
        };
        const { data: inserted, error: insErr } = await ext.from('conversation_assignments')
          .insert(insertRow)
          .select().single();
        if (insErr) {
          // Race: someone inserted between our check and insert. Re-read and reject.
          const { data: racedRows } = await ext.from('conversation_assignments')
            .select('id, assigned_to, status, sector_id, lead_id, channel_id, conversation_phone, updated_at, created_at')
            .eq('organization_id', orgId)
            .eq('channel_id', p.channel_id)
            .or(filter)
            .limit(10);
          const racedOwner = racedRows?.find((row: any) => row.assigned_to && row.assigned_to !== userId);
          if (racedOwner) return json({ success: false, error: 'already_assigned', assignment: racedOwner }, 200);
          return json({ error: insErr.message }, 500);
        }
        return json({ success: true, assignment: inserted, claimed: true });
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
        if (body.assigned_to !== undefined && !canOverrideAssignment) {
          if (body.assigned_to !== null && body.assigned_to !== user.id) {
            return json({ error: 'Only admins or supervisors can assign another attendant' }, 403);
          }
          q = q.or(`assigned_to.is.null,assigned_to.eq.${user.id}`);
        }
        if (id) {
          q = q.eq('id', id);
        } else if (channelId && phone) {
          const { filter } = buildPhoneMatch(phone);
          q = q.eq('channel_id', channelId).or(filter);
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
        const { filter } = buildPhoneMatch(phone);
        const { data, error } = await ext.from('conversation_assignments')
          .select('id, assigned_to, sector_id, status, lead_id, channel_id, conversation_phone, updated_at, created_at')
          .eq('organization_id', orgId)
          .eq('channel_id', channelId)
          .or(filter)
          .limit(10);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, assignment: pickAssignmentRow(data || [], user.id) });
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
        if (String(phone).replace(/^\+/, '').startsWith('webchat:')) {
          const key = String(phone).replace(/^\+/, '');
          const { error } = await ext.from('conversation_stats')
            .update({ unread_count: 0, updated_at: new Date().toISOString() })
            .eq('organization_id', orgId).eq('channel_id', channelId).eq('conversation_phone', key);
          if (error) return json({ error: error.message }, 500);
          return json({ success: true });
        }
        const norm = String(phone).replace(/\D/g, '');
        if (!norm) return json({ error: 'valid phone required' }, 400);
        const baseVariants = Array.isArray(body.phone_variants) && body.phone_variants.length
          ? body.phone_variants.map((p: unknown) => String(p).replace(/\D/g, '')).filter(Boolean)
          : [norm];
        const suffixes = Array.from(new Set<string>(baseVariants.map((p: string) => p.slice(-8)).filter(Boolean)));

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
