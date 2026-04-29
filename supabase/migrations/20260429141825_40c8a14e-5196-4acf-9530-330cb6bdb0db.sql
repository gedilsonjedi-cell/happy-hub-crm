
CREATE OR REPLACE FUNCTION public.get_campaign_real_counts(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  recipients_count bigint,
  sent_count bigint,
  delivered_count bigint,
  read_count bigint,
  failed_count bigint,
  interacted_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.campaign_id,
    COUNT(*)::bigint AS recipients_count,
    COUNT(*) FILTER (
      WHERE cr.sent_at IS NOT NULL
         OR cr.status IN ('sent','delivered','read','failed')
    )::bigint AS sent_count,
    COUNT(*) FILTER (
      WHERE cr.status IN ('delivered','read')
         OR cr.delivered_at IS NOT NULL
         OR cr.read_at IS NOT NULL
    )::bigint AS delivered_count,
    COUNT(*) FILTER (
      WHERE cr.status = 'read' OR cr.read_at IS NOT NULL
    )::bigint AS read_count,
    COUNT(*) FILTER (WHERE cr.status = 'failed')::bigint AS failed_count,
    COUNT(*) FILTER (WHERE cr.button_clicked IS NOT NULL)::bigint AS interacted_count
  FROM public.campaign_recipients cr
  WHERE cr.campaign_id = ANY(p_campaign_ids)
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = cr.campaign_id
          AND c.organization_id = public.get_user_organization_id(auth.uid())
      )
    )
  GROUP BY cr.campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_real_counts(uuid[]) TO authenticated;
