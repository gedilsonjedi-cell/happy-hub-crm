-- Create welcome message config table
CREATE TABLE public.welcome_message_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  message TEXT DEFAULT 'Olá! Seja bem-vindo(a)! Como posso ajudá-lo(a) hoje?',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.welcome_message_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage welcome message"
ON public.welcome_message_config
FOR ALL
USING (
  (organization_id = get_user_organization_id(auth.uid())) 
  AND is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can view their organization welcome message"
ON public.welcome_message_config
FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

-- Create table to track which contacts already received welcome message
CREATE TABLE public.welcome_message_sent (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, channel_id, contact_phone)
);

-- Enable RLS
ALTER TABLE public.welcome_message_sent ENABLE ROW LEVEL SECURITY;

-- System can manage (for webhooks)
CREATE POLICY "System can manage welcome sent records"
ON public.welcome_message_sent
FOR ALL
USING (true);

-- Add indexes for performance
CREATE INDEX idx_welcome_message_sent_lookup 
ON public.welcome_message_sent(organization_id, channel_id, contact_phone);

-- Update timestamp trigger
CREATE TRIGGER update_welcome_message_config_updated_at
BEFORE UPDATE ON public.welcome_message_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();