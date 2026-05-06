/**
 * Pagina queries de leads para contornar o limite padrão de 1000 linhas do Supabase.
 *
 * Estratégia:
 *  1. Faz um HEAD count para saber o total exato.
 *  2. Dispara todas as páginas (.range()) em PARALELO (com limite de concorrência).
 *
 * Isso é dramaticamente mais rápido do que paginar sequencialmente — para 5.000
 * leads, passamos de 5+ requisições em série (~3-8s) para 5 em paralelo (~400ms).
 */
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const MAX_CONCURRENCY = 6;

export interface FetchAllLeadsOptions {
  organizationId: string;
  columns: string;
  /** Coluna para ordenar (default: created_at desc). Use null para sem ordenação (mais rápido). */
  orderBy?: { column: string; ascending?: boolean } | null;
  /** Hard cap de segurança. Default 100k. */
  maxRows?: number;
}

export async function fetchAllLeads<T = any>({
  organizationId,
  columns,
  orderBy = { column: "created_at", ascending: false },
  maxRows = 100_000,
}: FetchAllLeadsOptions): Promise<T[]> {
  // 1) Conta total — barato, retorna só o header Content-Range.
  const { count, error: countError } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (countError) throw countError;

  const total = Math.min(count ?? 0, maxRows);
  if (total === 0) return [];

  // 2) Calcula páginas.
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const pageIndices = Array.from({ length: pageCount }, (_, i) => i);

  // 3) Executa em paralelo, mas com limite de concorrência para não estourar o pool.
  const results: T[][] = new Array(pageCount);

  const fetchPage = async (pageIdx: number): Promise<void> => {
    const from = pageIdx * PAGE_SIZE;
    const to = Math.min(from + PAGE_SIZE - 1, total - 1);

    let query = supabase
      .from("leads")
      .select(columns)
      .eq("organization_id", organizationId)
      .range(from, to);

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
    }

    const { data, error } = await query;
    if (error) throw error;
    results[pageIdx] = (data ?? []) as T[];
  };

  // Pool de concorrência manual.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, pageCount) }, async () => {
    while (cursor < pageIndices.length) {
      const idx = cursor++;
      await fetchPage(pageIndices[idx]);
    }
  });

  await Promise.all(workers);

  return results.flat();
}
