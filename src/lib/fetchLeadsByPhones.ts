/**
 * Busca apenas os leads cujo telefone bate com a lista de destinatários informada.
 *
 * Evita baixar a tabela inteira de leads (que pode ter dezenas de milhares de
 * linhas) só para resolver o nome de alguns milhares de números numa campanha.
 *
 * Estratégia:
 *  1. Para cada telefone do destinatário gera todas as variações canônicas
 *     (com/sem DDI 55, com/sem nono dígito) — assim casamos com qualquer
 *     formato salvo no CRM.
 *  2. Consulta `leads` em lotes via `.in('phone', batch)`.
 *  3. Retorna a união deduplicada por id.
 */
import { supabase } from "@/integrations/supabase/client";

const BATCH = 300; // tamanho seguro para clausula IN
const CONCURRENCY = 6;

function buildPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  const noCc = digits.startsWith("55") ? digits.slice(2) : digits;
  const variants = new Set<string>();
  variants.add(digits);
  variants.add(noCc);
  variants.add("55" + noCc);
  // Toggle nono dígito (apenas para celulares brasileiros: 11 dígitos com DDD)
  if (noCc.length === 11 && noCc[2] === "9") {
    const without9 = noCc.slice(0, 2) + noCc.slice(3);
    variants.add(without9);
    variants.add("55" + without9);
  } else if (noCc.length === 10) {
    const with9 = noCc.slice(0, 2) + "9" + noCc.slice(2);
    variants.add(with9);
    variants.add("55" + with9);
  }
  return [...variants].filter(Boolean);
}

export interface MatchedLead {
  id: string;
  phone: string;
  name: string | null;
}

export async function fetchLeadsByPhones<T = MatchedLead>(
  organizationId: string,
  phones: string[],
  columns = "id, phone, name",
): Promise<T[]> {
  const variantSet = new Set<string>();
  phones.forEach((p) => buildPhoneVariants(p).forEach((v) => variantSet.add(v)));
  const allVariants = [...variantSet];

  if (allVariants.length === 0) return [];

  // monta lotes
  const batches: string[][] = [];
  for (let i = 0; i < allVariants.length; i += BATCH) {
    batches.push(allVariants.slice(i, i + BATCH));
  }

  const results: T[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const idx = cursor++;
      const { data, error } = await supabase
        .from("leads")
        .select(columns)
        .eq("organization_id", organizationId)
        .in("phone", batches[idx]);
      if (error) throw error;
      if (data) results.push(...(data as unknown as T[]));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()),
  );

  // dedup por id
  const seen = new Set<string>();
  return results.filter((l) => {
    const id = (l as { id?: string }).id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
