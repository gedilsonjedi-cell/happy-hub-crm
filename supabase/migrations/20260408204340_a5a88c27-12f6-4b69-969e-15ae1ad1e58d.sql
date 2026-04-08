
-- Atomic increment function for redirect link clicks
CREATE OR REPLACE FUNCTION public.increment_redirect_click(link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE redirect_links
  SET click_count = click_count + 1
  WHERE id = link_id;
$$;

-- Enable realtime for redirect_links
ALTER PUBLICATION supabase_realtime ADD TABLE public.redirect_links;
