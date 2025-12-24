-- Create client_portfolios table to store client-user ownership
CREATE TABLE public.client_portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.client_portfolios ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view portfolios in their organization"
ON public.client_portfolios
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins and supervisors can manage portfolios"
ON public.client_portfolios
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND public.is_admin_or_supervisor(auth.uid())
);

CREATE POLICY "Users can manage their own portfolio"
ON public.client_portfolios
FOR ALL
USING (
  user_id = auth.uid()
  AND organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_client_portfolios_updated_at
BEFORE UPDATE ON public.client_portfolios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_client_portfolios_lead_id ON public.client_portfolios(lead_id);
CREATE INDEX idx_client_portfolios_user_id ON public.client_portfolios(user_id);
CREATE INDEX idx_client_portfolios_organization_id ON public.client_portfolios(organization_id);