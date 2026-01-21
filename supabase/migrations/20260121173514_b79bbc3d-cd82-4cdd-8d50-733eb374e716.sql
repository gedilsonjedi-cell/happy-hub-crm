-- Add columns for tracking delivery and read status
ALTER TABLE public.campaign_recipients 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS button_clicked TEXT,
ADD COLUMN IF NOT EXISTS button_clicked_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster status filtering
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON public.campaign_recipients(campaign_id, status);

-- Add comment for documentation
COMMENT ON COLUMN public.campaign_recipients.read_at IS 'Timestamp when message was read by recipient';
COMMENT ON COLUMN public.campaign_recipients.button_clicked IS 'The button text/id that recipient clicked';
COMMENT ON COLUMN public.campaign_recipients.button_clicked_at IS 'Timestamp when button was clicked';