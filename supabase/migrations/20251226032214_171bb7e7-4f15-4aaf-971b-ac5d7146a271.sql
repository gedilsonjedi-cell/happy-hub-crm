-- Add waba_id column to channels to group channels by WABA
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS waba_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_channels_waba_id ON public.channels(waba_id);