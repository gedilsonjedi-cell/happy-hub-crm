
-- 1. Cleanup conversation_metrics de conversas arquivadas há >15 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_conversation_metrics(cutoff_date timestamptz, batch_size int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT cm.id FROM conversation_metrics cm
    WHERE cm.conversation_assignment_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM conversation_assignments ca
        WHERE ca.id = cm.conversation_assignment_id
          AND ca.status != 'archived'
      )
      AND cm.created_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM conversation_metrics WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 2. Cleanup conversation_memory sem interação há >7 dias (independente de expires_at)
CREATE OR REPLACE FUNCTION public.cleanup_stale_conversation_memory(cutoff_date timestamptz, batch_size int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT id FROM conversation_memory
    WHERE last_interaction_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM conversation_memory WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 3. Cleanup follow_up_logs de instâncias concluídas/canceladas há >30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_follow_up_logs(cutoff_date timestamptz, batch_size int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT fl.id FROM follow_up_logs fl
    JOIN follow_up_instances fi ON fi.id = fl.instance_id
    WHERE fi.status IN ('completed', 'cancelled', 'failed')
      AND fi.updated_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM follow_up_logs WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 4. Cleanup chat_messages (conversas IA internas) antigas >30 dias
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages(cutoff_date timestamptz, batch_size int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT id FROM chat_messages
    WHERE created_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM chat_messages WHERE id IN (SELECT id FROM to_delete);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
