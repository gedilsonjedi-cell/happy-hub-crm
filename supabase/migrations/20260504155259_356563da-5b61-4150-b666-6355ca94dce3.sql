ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS channel_id uuid;
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_channel ON public.campaign_recipients(campaign_id, channel_id);