ALTER TABLE public.redirect_link_clicks ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_redirect_link_clicks_campaign ON public.redirect_link_clicks(campaign_id, clicked_at) WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_redirect_click_v2(link_id uuid, campaign_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid := NULL;
BEGIN
  IF log_redirect_click_v2.campaign_id IS NOT NULL THEN
    SELECT c.id INTO v_cid FROM campaigns c JOIN redirect_links l ON l.id = log_redirect_click_v2.link_id
    WHERE c.id = log_redirect_click_v2.campaign_id AND c.organization_id = l.organization_id;
  END IF;
  INSERT INTO redirect_link_clicks(link_id, campaign_id) VALUES (log_redirect_click_v2.link_id, v_cid);
  UPDATE redirect_links SET click_count = COALESCE(click_count,0)+1 WHERE id = log_redirect_click_v2.link_id;
END $$;
REVOKE ALL ON FUNCTION public.log_redirect_click_v2(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_redirect_click_v2(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_campaign_link_clicks(p_campaign_ids uuid[], p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL)
RETURNS TABLE(campaign_id uuid, clicks bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT k.campaign_id, COUNT(*)::bigint
  FROM redirect_link_clicks k JOIN campaigns c ON c.id = k.campaign_id
  WHERE k.campaign_id = ANY(p_campaign_ids)
    AND (p_start IS NULL OR k.clicked_at >= p_start)
    AND (p_end IS NULL OR k.clicked_at <= p_end)
    AND (public.is_super_admin(auth.uid()) OR c.organization_id = public.get_user_organization_id(auth.uid()))
  GROUP BY k.campaign_id;
$$;
REVOKE ALL ON FUNCTION public.get_campaign_link_clicks(uuid[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_link_clicks(uuid[], timestamptz, timestamptz) TO authenticated, service_role;