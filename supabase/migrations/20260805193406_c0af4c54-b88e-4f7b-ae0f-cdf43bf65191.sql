CREATE TABLE public.inbound_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  create_lead boolean NOT NULL DEFAULT true,
  auto_dispatch boolean NOT NULL DEFAULT false,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_webhooks_org ON public.inbound_webhooks(organization_id);
CREATE INDEX idx_inbound_webhooks_token ON public.inbound_webhooks(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_webhooks TO authenticated;
GRANT ALL ON public.inbound_webhooks TO service_role;

ALTER TABLE public.inbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view inbound webhooks"
ON public.inbound_webhooks FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can create inbound webhooks"
ON public.inbound_webhooks FOR INSERT TO authenticated
WITH CHECK (
  (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_supervisor(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can update inbound webhooks"
ON public.inbound_webhooks FOR UPDATE TO authenticated
USING (
  (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_supervisor(auth.uid()))
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_supervisor(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can delete inbound webhooks"
ON public.inbound_webhooks FOR DELETE TO authenticated
USING (
  (organization_id = public.get_user_organization_id(auth.uid()) AND public.is_admin_or_supervisor(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

CREATE TRIGGER update_inbound_webhooks_updated_at
BEFORE UPDATE ON public.inbound_webhooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inbound_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.inbound_webhooks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text,
  name text,
  lead_created boolean NOT NULL DEFAULT false,
  template_sent boolean NOT NULL DEFAULT false,
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_webhook_logs_webhook ON public.inbound_webhook_logs(webhook_id, created_at DESC);

GRANT SELECT ON public.inbound_webhook_logs TO authenticated;
GRANT ALL ON public.inbound_webhook_logs TO service_role;

ALTER TABLE public.inbound_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view inbound webhook logs"
ON public.inbound_webhook_logs FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id(auth.uid()) OR public.is_super_admin(auth.uid()));