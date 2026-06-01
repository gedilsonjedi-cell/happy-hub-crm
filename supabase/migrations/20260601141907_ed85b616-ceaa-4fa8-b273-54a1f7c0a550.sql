CREATE OR REPLACE FUNCTION public.claim_campaign_recipients(
  p_campaign_id uuid,
  p_batch_size integer,
  p_include_retries boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  phone text,
  name text,
  status text,
  retry_count integer,
  last_error_code text,
  is_retry boolean,
  lead_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND (
        c.status = 'running'
        OR (p_include_retries AND c.status = 'completed')
      )
    FOR UPDATE
  ) THEN
    RETURN;
  END IF;

  IF p_include_retries THEN
    RETURN QUERY
    WITH retries AS (
      SELECT cr.id
      FROM public.campaign_recipients cr
      WHERE cr.campaign_id = p_campaign_id
        AND cr.status = 'waiting_retry'
        AND cr.next_retry_at <= now()
      ORDER BY cr.next_retry_at ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.campaign_recipients cr
    SET status = 'processing', updated_at = now()
    FROM retries
    WHERE cr.id = retries.id
    RETURNING cr.id, cr.phone, cr.name, 'waiting_retry'::text, cr.retry_count, cr.last_error_code, true, cr.lead_id;
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT cr.id
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = p_campaign_id
      AND cr.status = 'pending'
    ORDER BY cr.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.campaign_recipients cr
  SET status = 'processing', updated_at = now()
  FROM claimed
  WHERE cr.id = claimed.id
  RETURNING cr.id, cr.phone, cr.name, 'pending'::text, cr.retry_count, cr.last_error_code, false, cr.lead_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_campaign_recipients(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_recipients(uuid, integer, boolean) TO service_role;