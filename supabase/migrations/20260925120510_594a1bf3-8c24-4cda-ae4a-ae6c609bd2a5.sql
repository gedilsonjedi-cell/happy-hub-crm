CREATE TABLE IF NOT EXISTS public.redirect_link_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.redirect_links(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redirect_link_clicks_link_time ON public.redirect_link_clicks(link_id, clicked_at DESC);
GRANT SELECT ON public.redirect_link_clicks TO authenticated;
GRANT ALL ON public.redirect_link_clicks TO service_role;
ALTER TABLE public.redirect_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view link clicks" ON public.redirect_link_clicks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.redirect_links l WHERE l.id = link_id
  AND (l.organization_id::text = public.effective_org_id() OR public.is_super_admin(auth.uid()))));

CREATE OR REPLACE FUNCTION public.log_redirect_click(link_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO redirect_link_clicks(link_id) VALUES (log_redirect_click.link_id);
  UPDATE redirect_links SET click_count = COALESCE(click_count,0)+1 WHERE id = log_redirect_click.link_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_redirect_link_stats(_link_ids uuid[])
RETURNS TABLE(link_id uuid, clicks_today bigint, clicks_week bigint, clicks_month bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH bounds AS (
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') d,
           (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') w,
           (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') m
  )
  SELECT l.id,
    count(c.id) FILTER (WHERE c.clicked_at >= b.d),
    count(c.id) FILTER (WHERE c.clicked_at >= b.w),
    count(c.id) FILTER (WHERE c.clicked_at >= b.m)
  FROM redirect_links l CROSS JOIN bounds b
  LEFT JOIN redirect_link_clicks c ON c.link_id = l.id AND c.clicked_at >= LEAST(b.w, b.m)
  WHERE l.id = ANY(_link_ids)
    AND (l.organization_id::text = effective_org_id() OR is_super_admin(auth.uid()))
  GROUP BY l.id
$$;
REVOKE EXECUTE ON FUNCTION public.get_redirect_link_stats(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_redirect_link_stats(uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';