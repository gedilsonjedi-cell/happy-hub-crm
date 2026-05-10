/**
 * External Assignments helper
 *
 * Centraliza TODOS os acessos a `conversation_assignments` e `conversation_stats`
 * apontando para o Supabase EXTERNO (SSoT). Reads vão direto via JWT customizado.
 * Writes vão pela edge function `external-assignments-write` (que valida o JWT
 * do usuário interno e usa service_role no externo).
 *
 * Uso:
 *   const ext = await getExternalAssignments();
 *   const { data } = await ext.from("conversation_assignments").select(...);
 *   await assignmentsWrite("update_assignment_status", { id, status: "archived" });
 */
import { supabase } from "@/integrations/supabase/client";
import { getExternalClient } from "@/lib/externalSupabaseClient";

export async function getExternalAssignments(impersonatedOrgId?: string | null) {
  return getExternalClient(impersonatedOrgId ?? undefined);
}

export type AssignmentWriteAction =
  | "upsert_assignment"
  | "update_assignment_status"
  | "assign_to"
  | "transfer"
  | "update_by_phone"
  | "read_assignment_by_phone"
  | "archive"
  | "restore"
  | "reset_unread"
  | "upsert_stats";

export interface AssignmentWriteOpts {
  impersonatedOrgId?: string | null;
}

export async function assignmentsWrite(
  action: AssignmentWriteAction,
  body: Record<string, unknown>,
  opts?: AssignmentWriteOpts
): Promise<{ data: any; error: { message: string } | null }> {
  const payload: Record<string, unknown> = { action, ...body };
  if (opts?.impersonatedOrgId) payload.impersonatedOrgId = opts.impersonatedOrgId;

  const { data, error } = await supabase.functions.invoke(
    "external-assignments-write",
    { body: payload }
  );

  if (error) return { data: null, error: { message: error.message } };
  if (data && typeof data === "object" && "error" in data && data.error) {
    return { data: null, error: { message: String(data.error) } };
  }
  return { data, error: null };
}
