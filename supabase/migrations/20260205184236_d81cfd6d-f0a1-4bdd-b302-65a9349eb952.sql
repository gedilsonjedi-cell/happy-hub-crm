-- Add manual_variables column to campaigns table to persist manual variable values
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS manual_variables jsonb DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.campaigns.manual_variables IS 'Stores manual variable values entered during campaign creation (e.g., {"VAR_1": "value1", "VAR_2": "value2"})';