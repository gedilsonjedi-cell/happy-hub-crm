-- Add min_interval and max_interval columns to campaigns table
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS min_interval integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS max_interval integer DEFAULT 120;

-- Add comment for documentation
COMMENT ON COLUMN public.campaigns.min_interval IS 'Minimum interval in seconds for random dispatch cadence';
COMMENT ON COLUMN public.campaigns.max_interval IS 'Maximum interval in seconds for random dispatch cadence';