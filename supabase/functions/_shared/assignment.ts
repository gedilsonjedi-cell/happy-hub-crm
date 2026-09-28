// Distribuição automática compartilhada (WhatsApp/meta-webhook e Web Chat).
// Mesma fila/setor para todos os canais — não reimplementar em outro lugar.
// deno-lint-ignore-file no-explicit-any
type Db = any;

const cache = new Map<string, { v: string | null; exp: number }>();

/** Departamento padrão da org quando a distribuição automática está ligada; senão null. */
export async function getOrgDefaultSector(db: Db, organizationId: string): Promise<string | null> {
  const hit = cache.get(organizationId);
  if (hit && hit.exp > Date.now()) return hit.v;
  const { data } = await db.from("organizations")
    .select("auto_distribute_enabled, default_sector_id").eq("id", organizationId).maybeSingle();
  const v = data?.auto_distribute_enabled && data?.default_sector_id ? (data.default_sector_id as string) : null;
  cache.set(organizationId, { v, exp: Date.now() + 60_000 });
  return v;
}

function touch(db: Db, organizationId: string, userId: string) {
  db.from("attendant_availability").update({ last_assignment_at: new Date().toISOString() })
    .eq("user_id", userId).eq("organization_id", organizationId).then(() => {}, () => {});
}

/**
 * Round-robin dentro do setor, SOMENTE entre atendentes online.
 * Ninguém online → null (conversa fica na fila de espera do departamento e
 * é entregue pelo redistribute-pending-assignments quando alguém ficar online).
 */
export async function getNextAvailableAttendant(db: Db, organizationId: string, sectorId: string | null): Promise<{ userId: string } | null> {
  if (!sectorId) return null;
  const { data: sectorUsers } = await db.from("user_sectors").select("user_id").eq("sector_id", sectorId);
  if (!sectorUsers?.length) return null;
  const userIds = sectorUsers.map((u: { user_id: string }) => u.user_id);

  const { data: list } = await db.from("attendant_availability")
    .select("user_id, last_assignment_at").eq("organization_id", organizationId).eq("is_available", true)
    .in("user_id", userIds).order("last_assignment_at", { ascending: true, nullsFirst: true });
  if (!list?.length) return null;
  const next = list[0];
  // Aguarda a marcação para o próximo round-robin não pegar a mesma pessoa.
  await db.from("attendant_availability").update({ last_assignment_at: new Date().toISOString() })
    .eq("user_id", next.user_id).eq("organization_id", organizationId).then(() => {}, () => {});
  return { userId: next.user_id };
}

/** Round-robin global entre atendentes online (leads de anúncio sem setor). */
export async function getNextAvailableAttendantGlobal(db: Db, organizationId: string): Promise<{ userId: string } | null> {
  const { data } = await db.from("attendant_availability").select("user_id, last_assignment_at")
    .eq("organization_id", organizationId).eq("is_available", true)
    .order("last_assignment_at", { ascending: true, nullsFirst: true });
  if (!data?.length) return null;
  touch(db, organizationId, data[0].user_id);
  return { userId: data[0].user_id };
}

/** Setor padrão + round-robin: o mesmo resultado que uma conversa nova de WhatsApp recebe. */
export async function pickDistribution(db: Db, organizationId: string, existingSectorId: string | null = null) {
  const sectorId = existingSectorId || (await getOrgDefaultSector(db, organizationId));
  const attendant = sectorId ? await getNextAvailableAttendant(db, organizationId, sectorId) : null;
  return { sectorId, assignedTo: attendant?.userId ?? null, status: attendant ? "in_progress" : "pending" };
}
