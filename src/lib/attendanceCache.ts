/**
 * Cache em memória (módulo) da lista de conversas da tela de Atendimento.
 *
 * Motivo: AtendimentoV2 guarda tudo em useState local, então sair da tela
 * (ex.: ir para Leads) e voltar desmontava o componente e refazia o fetch
 * completo do zero — com a lista em branco enquanto isso.
 *
 * Aqui guardamos o último snapshot bem-sucedido por chave (organização +
 * usuário + escopo de visibilidade) para hidratar a UI instantaneamente no
 * remount e revalidar em segundo plano (stale-while-revalidate).
 */

export interface AttendanceSnapshot<TConversation, TLeadLookups, TStatuses> {
  conversations: TConversation[];
  statuses: TStatuses;
  leadLookups: TLeadLookups;
  offset: number;
  hasMore: boolean;
  storedAt: number;
}

const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, AttendanceSnapshot<any, any, any>>();

export function buildAttendanceCacheKey(parts: {
  organizationId: string | null | undefined;
  userId: string | null | undefined;
  scope: string;
}): string | null {
  if (!parts.organizationId || !parts.userId) return null;
  return `${parts.organizationId}|${parts.userId}|${parts.scope}`;
}

export function readAttendanceSnapshot<C, L, S>(
  key: string | null
): AttendanceSnapshot<C, L, S> | null {
  if (!key) return null;
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit as AttendanceSnapshot<C, L, S>;
}

export function writeAttendanceSnapshot<C, L, S>(
  key: string | null,
  snapshot: Omit<AttendanceSnapshot<C, L, S>, "storedAt">
) {
  if (!key) return;
  store.set(key, { ...snapshot, storedAt: Date.now() });
}

export function clearAttendanceSnapshots() {
  store.clear();
}
