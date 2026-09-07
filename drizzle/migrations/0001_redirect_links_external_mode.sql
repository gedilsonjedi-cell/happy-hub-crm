ALTER TABLE public.redirect_links
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'multi_number',
  ADD COLUMN IF NOT EXISTS original_url text;

ALTER TABLE public.redirect_links
  DROP CONSTRAINT IF EXISTS redirect_links_link_type_check;

ALTER TABLE public.redirect_links
  ADD CONSTRAINT redirect_links_link_type_check
  CHECK (link_type IN ('multi_number', 'external_redirect'));

CREATE OR REPLACE FUNCTION public.resolve_redirect_link_v2(_slug text)
RETURNS TABLE(id uuid, destinations jsonb, link_type text, original_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rl.id, rl.destinations, rl.link_type, rl.original_url
  FROM public.redirect_links rl
  WHERE rl.slug = _slug
    AND rl.is_active = true
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_redirect_link_v2(text) TO anon, authenticated, service_role;