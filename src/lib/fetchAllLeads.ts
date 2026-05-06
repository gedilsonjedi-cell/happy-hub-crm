/**
 * Pagina queries de leads para contornar o limite padrão de 1000 linhas do Supabase.
 *
 * Usa .range() em lotes de 1000 até esgotar. Mantém ordem do servidor.
 */
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

export interface FetchAllLeadsOptions {
  organizationId: string;
  columns: string;
  /** Coluna para ordenar (default: created_at desc). Use null para sem ordenação. */
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
  const all: T[] = [];
  let from = 0;

  while (from < maxRows) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);

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

    const rows = (data ?? []) as T[];
    all.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
