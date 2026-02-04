-- Table to store URA configuration per channel
CREATE TABLE public.ura_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  is_enabled BOOLEAN DEFAULT true,
  create_lead_if_not_exists BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(channel_id)
);

-- Enable RLS
ALTER TABLE public.ura_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view URA config for their organization"
ON public.ura_config FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can insert URA config"
ON public.ura_config FOR INSERT
WITH CHECK (organization_id = get_user_organization_id(auth.uid()) AND is_admin(auth.uid()));

CREATE POLICY "Admins can update URA config"
ON public.ura_config FOR UPDATE
USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete URA config"
ON public.ura_config FOR DELETE
USING (organization_id = get_user_organization_id(auth.uid()) AND is_admin(auth.uid()));

-- Super admin full access
CREATE POLICY "Super admins have full access to ura_config"
ON public.ura_config FOR ALL
USING (is_super_admin(auth.uid()));

-- Table to log URA webhook calls
CREATE TABLE public.ura_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  caller_phone TEXT NOT NULL,
  template_sent BOOLEAN DEFAULT false,
  lead_created BOOLEAN DEFAULT false,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for logs
ALTER TABLE public.ura_webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS for logs - based on channel's organization
CREATE POLICY "Users can view URA logs for their organization channels"
ON public.ura_webhook_logs FOR SELECT
USING (
  channel_id IN (
    SELECT id FROM public.channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  ) OR is_super_admin(auth.uid())
);

-- Add updated_at trigger
CREATE TRIGGER update_ura_config_updated_at
BEFORE UPDATE ON public.ura_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();