-- Create webhooks table for integrations
CREATE TABLE public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view webhooks from their organization"
ON public.webhooks FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can create webhooks for their organization"
ON public.webhooks FOR INSERT
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can update webhooks from their organization"
ON public.webhooks FOR UPDATE
USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete webhooks from their organization"
ON public.webhooks FOR DELETE
USING (organization_id = get_user_organization_id(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_webhooks_updated_at
BEFORE UPDATE ON public.webhooks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();