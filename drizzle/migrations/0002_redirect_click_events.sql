CREATE TABLE public.redirect_link_clicks (
  id bigserial PRIMARY KEY,
  link_id uuid NOT NULL REFERENCES public.redirect_links(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.redirect_link_clicks TO authenticated;
GRANT ALL ON public.redirect_link_clicks TO service_role;

ALTER TABLE public.redirect_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org link clicks"
ON public.redirect_link_clicks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.redirect_links rl
    WHERE rl.id = redirect_link_clicks.link_id
      AND (rl.organization_id = public.get_user_organization_id(auth.uid())
           OR public.is_super_admin(auth.uid()))
  )
);

CREATE INDEX idx_redirect_link_clicks_link_time
  ON public.redirect_link_clicks (link_id, clicked_at DESC);

CREATE OR REPLACE FUNCTION public.log_redirect_click(link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.redirect_link_clicks (link_id) VALUES (log_redirect_click.link_id);
$function$;

GRANT EXECUTE ON FUNCTION public.log_redirect_click(uuid) TO anon, authenticated, service_role;

ALTER TABLE public.redirect_links ADD COLUMN IF NOT EXISTS click_count_base integer NOT NULL DEFAULT 0;
UPDATE public.redirect_links SET click_count_base = COALESCE(click_count, 0);

CREATE OR REPLACE FUNCTION public.sync_redirect_click_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.redirect_links rl
  SET click_count = agg.total + COALESCE(rl.click_count_base, 0)
  FROM (
    SELECT l.id, (SELECT count(*) FROM public.redirect_link_clicks c WHERE c.link_id = l.id) AS total
    FROM public.redirect_links l
  ) agg
  WHERE agg.id = rl.id
    AND rl.click_count IS DISTINCT FROM (agg.total + COALESCE(rl.click_count_base, 0))::integer;
END;
$function$;

DROP INDEX IF EXISTS public.idx_redirect_links_slug;