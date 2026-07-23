
CREATE OR REPLACE FUNCTION public.apply_lead_cleanup_batch(
  _run_id UUID,
  _batch JSONB
)
RETURNS TABLE(inserted_logs INT, deleted_leads INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_ins INT := 0;
  v_del INT := 0;
BEGIN
  IF _batch IS NULL OR jsonb_array_length(_batch) = 0 THEN
    inserted_logs := 0; deleted_leads := 0; RETURN NEXT; RETURN;
  END IF;

  WITH rows AS (
    SELECT
      NULLIF(x->>'organization_id','')::uuid AS organization_id,
      (x->>'lead_id')::uuid AS lead_id,
      x->>'phone' AS phone,
      COALESCE(x->>'motivo','reforçado 131026') AS motivo,
      (x->>'distinct_campaigns')::int AS dc,
      NULLIF(x->>'last_failure_at','')::timestamptz AS lastf
    FROM jsonb_array_elements(_batch) AS x
  ), ins AS (
    INSERT INTO public.lead_cleanup_log
      (organization_id, lead_id, phone, motivo, run_id, distinct_campaigns, last_failure_at)
    SELECT organization_id, lead_id, phone, motivo, _run_id, dc, lastf FROM rows
    RETURNING lead_id
  )
  SELECT array_agg(lead_id) INTO v_ids FROM ins;
  v_ins := COALESCE(array_length(v_ids, 1), 0);

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
    DELETE FROM public.leads WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_del = ROW_COUNT;
  END IF;

  inserted_logs := v_ins;
  deleted_leads := v_del;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_lead_cleanup_batch(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_lead_cleanup_batch(UUID, JSONB) TO service_role, authenticated;
