
-- Função para limpar assignments arquivadas/resolvidas em lotes
CREATE OR REPLACE FUNCTION public.cleanup_old_assignments(cutoff_date timestamptz, batch_size int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT id FROM conversation_assignments
    WHERE status IN ('resolved', 'closed', 'archived')
      AND updated_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM conversation_assignments
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Função para limpar recipients de campanhas concluídas em lotes
CREATE OR REPLACE FUNCTION public.cleanup_old_campaign_recipients(cutoff_date timestamptz, batch_size int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT cr.id FROM campaign_recipients cr
    JOIN campaigns c ON c.id = cr.campaign_id
    WHERE c.status = 'completed'
      AND c.completed_at < cutoff_date
    LIMIT batch_size
  )
  DELETE FROM campaign_recipients
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
