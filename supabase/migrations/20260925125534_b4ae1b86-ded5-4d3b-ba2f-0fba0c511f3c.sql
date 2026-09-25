ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_due ON public.campaign_recipients (campaign_id, status, scheduled_at);

CREATE OR REPLACE FUNCTION public.schedule_campaign_recipients(p_campaign_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _min int; _max int; _cursor timestamptz; _r record; _n int := 0; _first boolean := true;
BEGIN
  SELECT COALESCE(min_interval,5), COALESCE(max_interval,90) INTO _min, _max FROM campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF _max < _min THEN _max := _min; END IF;
  SELECT GREATEST(now(), COALESCE(max(scheduled_at), now())) INTO _cursor
    FROM campaign_recipients WHERE campaign_id = p_campaign_id AND scheduled_at IS NOT NULL AND status = 'pending';
  _first := NOT EXISTS (SELECT 1 FROM campaign_recipients WHERE campaign_id = p_campaign_id AND scheduled_at IS NOT NULL AND status='pending');
  FOR _r IN SELECT id FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'pending' AND scheduled_at IS NULL ORDER BY created_at, id FOR UPDATE LOOP
    IF NOT _first AND _max > 0 THEN
      _cursor := _cursor + make_interval(secs => _min + floor(random() * (_max - _min + 1)));
    END IF;
    _first := false;
    UPDATE campaign_recipients SET scheduled_at = _cursor WHERE id = _r.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.schedule_campaign_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_campaign_recipients(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_campaign_recipients(p_campaign_id uuid, p_batch_size integer, p_include_retries boolean DEFAULT true)
 RETURNS TABLE(id uuid, phone text, name text, status text, retry_count integer, last_error_code text, is_retry boolean, lead_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id
      AND (c.status = 'running' OR (p_include_retries AND c.status = 'completed')) FOR UPDATE) THEN
    RETURN;
  END IF;
  PERFORM public.schedule_campaign_recipients(p_campaign_id);
  IF p_include_retries THEN
    RETURN QUERY
    WITH retries AS (
      SELECT cr.id FROM public.campaign_recipients cr
      WHERE cr.campaign_id = p_campaign_id AND cr.status = 'waiting_retry' AND cr.next_retry_at <= now()
      ORDER BY cr.next_retry_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED)
    UPDATE public.campaign_recipients cr SET status = 'processing', updated_at = now()
    FROM retries WHERE cr.id = retries.id
    RETURNING cr.id, cr.phone, cr.name, 'waiting_retry'::text, cr.retry_count, cr.last_error_code, true, cr.lead_id;
  END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT cr.id FROM public.campaign_recipients cr
    WHERE cr.campaign_id = p_campaign_id AND cr.status = 'pending'
      AND (cr.scheduled_at IS NULL OR cr.scheduled_at <= now())
    ORDER BY cr.scheduled_at ASC NULLS FIRST, cr.created_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED)
  UPDATE public.campaign_recipients cr SET status = 'processing', updated_at = now()
  FROM claimed WHERE cr.id = claimed.id
  RETURNING cr.id, cr.phone, cr.name, 'pending'::text, cr.retry_count, cr.last_error_code, false, cr.lead_id;
END;
$function$;