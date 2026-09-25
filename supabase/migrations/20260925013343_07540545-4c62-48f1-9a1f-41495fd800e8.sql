DROP POLICY IF EXISTS org_isolation_all ON public.conversation_assignments;
CREATE POLICY org_isolation_all ON public.conversation_assignments FOR ALL TO authenticated
USING (((organization_id)::text = public.effective_org_id()) OR public.is_super_admin(auth.uid()))
WITH CHECK (((organization_id)::text = public.effective_org_id()) OR public.is_super_admin(auth.uid()));

CREATE TABLE public.webchat_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  name text NOT NULL,
  greeting_message text,
  theme_color text NOT NULL DEFAULT '#3385FF',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webchat_links TO authenticated;
GRANT ALL ON public.webchat_links TO service_role;
ALTER TABLE public.webchat_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation_all ON public.webchat_links FOR ALL TO authenticated
USING (((organization_id)::text = public.effective_org_id()) OR public.is_super_admin(auth.uid()))
WITH CHECK (((organization_id)::text = public.effective_org_id()) OR public.is_super_admin(auth.uid()));
CREATE INDEX idx_webchat_links_org ON public.webchat_links(organization_id);

CREATE OR REPLACE FUNCTION public.webchat_links_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_webchat_links_touch BEFORE UPDATE ON public.webchat_links FOR EACH ROW EXECUTE FUNCTION public.webchat_links_touch();