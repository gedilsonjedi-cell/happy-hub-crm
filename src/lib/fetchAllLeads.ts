/**
 * Pagina queries de leads para contornar o limite padrão de 1000 linhas do Supabase.
 *
 * IMPORTANTE: NÃO usa `count: exact` — em tabelas grandes com RLS, o COUNT
 * exato força um scan completo da tabela e pode levar 2-10 segundos sozinho.
 *
 * Estratégia adaptativa:
 *  1. Busca a primeira página.
 *  2. Se vier cheia (1000), dispara as próximas páginas em ondas paralelas
 *     até receber uma página parcial (= fim).
 */
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const MAX_CONCURRENCY = 10;

export interface FetchAllLeadsOptions {
  organizationId: string;
  columns: string;
  /** Coluna para ordenar (default: sem ordenação — mais rápido). */
  orderBy?: { column: string; ascending?: boolean } | null;
  /** Hard cap de segurança. Default 100k. */
  maxRows?: number;
}

export async function fetchAllLeads<T = any>({
  organizationId,
  columns,
  orderBy = null,
  maxRows = 100_000,
}: FetchAllLeadsOptions): Promise<T[]> {
  const fetchPage = async (pageIdx: number, attempt = 0): Promise<T[]> => {
    const from = pageIdx * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("leads")
      .select(columns)
      .eq("organization_id", organizationId)
      .range(from, to);

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
    }
    // Tiebreaker estável — sem isso, leads com mesmo created_at podem se repetir
    // entre páginas paralelas e sumir do conjunto final após dedup.
    query = query.order("id", { ascending: true });

    const { data, error } = await query;
    if (error) {
      // Retry transient failures (timeouts, rate-limits) up to 3 vezes com backoff.
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        return fetchPage(pageIdx, attempt + 1);
      }
      throw error;
    }
    return (data ?? []) as T[];
  };

  // Página inicial
  const first = await fetchPage(0);
  if (first.length < PAGE_SIZE) return dedupeById(first);

  const all: T[][] = [first];
  let nextPage = 1;
  let done = false;

  while (!done && all.flat().length < maxRows) {
    // Dispara onda paralela
    const wave = Array.from({ length: MAX_CONCURRENCY }, (_, i) => nextPage + i);
    const results = await Promise.all(wave.map((p) => fetchPage(p)));

    for (const r of results) {
      all.push(r);
      if (r.length < PAGE_SIZE) {
        done = true;
      }
    }
    nextPage += MAX_CONCURRENCY;
  }

  const flat = dedupeById(all.flat());
  return flat.length > maxRows ? flat.slice(0, maxRows) : flat;
}

function dedupeById<T>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const id = (r as { id?: string })?.id;
    if (!id) {
      out.push(r);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}
