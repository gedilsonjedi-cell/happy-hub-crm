-- Add variable_mappings column to store how each variable maps to contact fields
ALTER TABLE public.message_templates 
ADD COLUMN IF NOT EXISTS variable_mappings jsonb DEFAULT '{}';

-- Add comment explaining the column
COMMENT ON COLUMN public.message_templates.variable_mappings IS 'Maps template variables to contact fields or manual input. E.g., {"NOME": "contact_name", "CIDADE": "contact_city", "PROMO": "manual"}';