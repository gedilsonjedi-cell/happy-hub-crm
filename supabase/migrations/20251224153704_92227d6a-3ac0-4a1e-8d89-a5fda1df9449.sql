-- Create hygiene_history table to store sanitization records
CREATE TABLE public.hygiene_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  source_type TEXT NOT NULL, -- 'csv' or 'leads'
  total_numbers INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  blacklisted_count INTEGER NOT NULL DEFAULT 0,
  leads_saved INTEGER NOT NULL DEFAULT 0,
  leads_deleted INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.hygiene_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their organization hygiene history"
ON public.hygiene_history
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert hygiene history for their organization"
ON public.hygiene_history
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Add index for faster queries
CREATE INDEX idx_hygiene_history_org_id ON public.hygiene_history(organization_id);
CREATE INDEX idx_hygiene_history_created_at ON public.hygiene_history(created_at DESC);