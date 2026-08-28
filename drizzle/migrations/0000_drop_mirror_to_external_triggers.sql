-- Remove os triggers de espelhamento para o banco externo.
-- O banco interno foi aposentado como fonte de conversation_assignments/stats
-- (cutover concluído): manter estes triggers permitia que escritas internas
-- sobrescrevessem por id as linhas do banco externo (SSoT), incluindo assigned_to.
DROP TRIGGER IF EXISTS trg_mirror_ca ON public.conversation_assignments;
DROP TRIGGER IF EXISTS trg_mirror_cs ON public.conversation_stats;
DROP FUNCTION IF EXISTS public.mirror_row_to_external();