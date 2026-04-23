
-- Public read access for redirect_links via SECURITY DEFINER function
-- This allows anonymous visitors to resolve redirect slugs without exposing the full table

CREATE OR REPLACE FUNCTION public.get_redirect_link_public(_slug text)
RETURNS TABLE (
  id uuid,
  destinations jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, destinations
  FROM public.redirect_links
  WHERE slug = _slug
    AND is_active = true
  LIMIT 1;
$$;

-- Allow anon and authenticated to call it
GRANT EXECUTE ON FUNCTION public.get_redirect_link_public(text) TO anon, authenticated;

-- Make sure increment_redirect_click is also callable by anon (for click tracking)
GRANT EXECUTE ON FUNCTION public.increment_redirect_click(uuid) TO anon, authenticated;
