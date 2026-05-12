ALTER TABLE public.campaign_channels ADD COLUMN IF NOT EXISTS flow_bot_id uuid;
CREATE INDEX IF NOT EXISTS idx_campaign_channels_flow_bot_id ON public.campaign_channels(flow_bot_id);