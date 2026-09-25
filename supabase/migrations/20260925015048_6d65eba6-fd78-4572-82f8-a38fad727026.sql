ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS auto_distribute_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_sector_id uuid;

ALTER TABLE public.redirect_links
  ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'multi_number',
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS webchat_link_id uuid REFERENCES public.webchat_links(id) ON DELETE SET NULL;

ALTER TABLE public.redirect_links DROP CONSTRAINT IF EXISTS redirect_links_link_type_check;
ALTER TABLE public.redirect_links ADD CONSTRAINT redirect_links_link_type_check
  CHECK (link_type IN ('multi_number','external_redirect','web_chat'));

-- Isolation: a redirect link can only point to a web chat link of the same org
CREATE OR REPLACE FUNCTION public.redirect_links_validate_webchat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.link_type = 'web_chat' THEN
    IF NEW.webchat_link_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM webchat_links w WHERE w.id = NEW.webchat_link_id AND w.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Link de Web Chat inválido para esta organização' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_redirect_links_validate_webchat ON public.redirect_links;
CREATE TRIGGER trg_redirect_links_validate_webchat BEFORE INSERT OR UPDATE ON public.redirect_links
  FOR EACH ROW EXECUTE FUNCTION public.redirect_links_validate_webchat();

-- Isolation: web chat link channel must be a web_chat channel of the same org
CREATE OR REPLACE FUNCTION public.webchat_links_validate_channel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM channels c WHERE c.id = NEW.channel_id AND c.organization_id = NEW.organization_id AND c.provider = 'web_chat'
  ) THEN
    RAISE EXCEPTION 'Canal inválido para esta organização' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_webchat_links_validate_channel ON public.webchat_links;
CREATE TRIGGER trg_webchat_links_validate_channel BEFORE INSERT OR UPDATE ON public.webchat_links
  FOR EACH ROW EXECUTE FUNCTION public.webchat_links_validate_channel();

CREATE OR REPLACE FUNCTION public.resolve_redirect_link_v2(_slug text)
RETURNS TABLE(id uuid, link_type text, original_url text, destinations jsonb, webchat_link_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.link_type, r.original_url, r.destinations, r.webchat_link_id
  FROM redirect_links r WHERE r.slug = _slug AND COALESCE(r.is_active, true) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.log_redirect_click(link_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE redirect_links SET click_count = COALESCE(click_count, 0) + 1 WHERE id = link_id
$$;

GRANT EXECUTE ON FUNCTION public.resolve_redirect_link_v2(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_redirect_click(uuid) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.redirect_links_validate_webchat() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.webchat_links_validate_channel() FROM anon, authenticated;