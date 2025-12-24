-- Add new columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS document TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Create table for organization custom field definitions
CREATE TABLE IF NOT EXISTS public.lead_custom_field_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text, number, date, select
  field_options TEXT[] DEFAULT NULL, -- for select type
  is_required BOOLEAN DEFAULT false,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, field_name)
);

-- Enable RLS
ALTER TABLE public.lead_custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view custom field definitions of their organization"
ON public.lead_custom_field_definitions
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage custom field definitions"
ON public.lead_custom_field_definitions
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
  AND public.is_admin_or_supervisor(auth.uid())
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_lead_custom_field_definitions_org 
ON public.lead_custom_field_definitions(organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_lead_custom_field_definitions_updated_at
BEFORE UPDATE ON public.lead_custom_field_definitions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();