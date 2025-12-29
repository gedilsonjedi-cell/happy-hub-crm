
-- Create table for saved cards and auto-recharge settings
CREATE TABLE public.auto_recharge_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  min_balance_threshold NUMERIC DEFAULT 10,
  recharge_amount NUMERIC DEFAULT 50,
  card_token TEXT,
  card_last_four TEXT,
  card_brand TEXT,
  cardholder_name TEXT,
  customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.auto_recharge_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their organization's auto recharge config"
ON public.auto_recharge_config
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage their organization's auto recharge config"
ON public.auto_recharge_config
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND is_admin(auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_auto_recharge_config_updated_at
BEFORE UPDATE ON public.auto_recharge_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
