
-- Atomic function to claim campaign recipients, preventing race conditions
-- Returns the claimed recipients so no two concurrent calls get the same ones
CREATE OR REPLACE FUNCTION public.claim_campaign_recipients(
  p_campaign_id uuid,
  p_batch_size integer DEFAULT 1,
  p_include_retries boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  phone text,
  name text,
  status text,
  retry_count integer,
  last_error_code text,
  is_retry boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First claim retry recipients (atomically)
  IF p_include_retries THEN
    RETURN QUERY
    WITH retries AS (
      SELECT cr.id
      FROM campaign_recipients cr
      WHERE cr.campaign_id = p_campaign_id
        AND cr.status = 'waiting_retry'
        AND cr.next_retry_at <= now()
      ORDER BY cr.next_retry_at ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE campaign_recipients cr
    SET status = 'processing', updated_at = now()
    FROM retries
    WHERE cr.id = retries.id
    RETURNING cr.id, cr.phone, cr.name, 'waiting_retry'::text AS status, cr.retry_count, cr.last_error_code, true AS is_retry;
  END IF;

  -- Then claim pending recipients with remaining slots
  RETURN QUERY
  WITH claimed AS (
    SELECT cr.id
    FROM campaign_recipients cr
    WHERE cr.campaign_id = p_campaign_id
      AND cr.status = 'pending'
    ORDER BY cr.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE campaign_recipients cr
  SET status = 'processing', updated_at = now()
  FROM claimed
  WHERE cr.id = claimed.id
  RETURNING cr.id, cr.phone, cr.name, 'pending'::text AS status, cr.retry_count, cr.last_error_code, false AS is_retry;
END;
$$;

-- Function to get accurate campaign counts from campaign_recipients
CREATE OR REPLACE FUNCTION public.get_campaign_counts(p_campaign_id uuid)
RETURNS TABLE(
  total_sent bigint,
  total_delivered bigint,
  total_failed bigint,
  total_pending bigint,
  total_waiting_retry bigint,
  total_processing bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')) AS total_sent,
    COUNT(*) FILTER (WHERE status IN ('delivered', 'read')) AS total_delivered,
    COUNT(*) FILTER (WHERE status = 'failed') AS total_failed,
    COUNT(*) FILTER (WHERE status = 'pending') AS total_pending,
    COUNT(*) FILTER (WHERE status = 'waiting_retry') AS total_waiting_retry,
    COUNT(*) FILTER (WHERE status = 'processing') AS total_processing
  FROM campaign_recipients
  WHERE campaign_id = p_campaign_id;
$$;
