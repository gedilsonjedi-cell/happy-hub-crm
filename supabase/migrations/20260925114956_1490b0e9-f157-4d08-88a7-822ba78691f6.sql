ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS flow_bot_id uuid;
ALTER TABLE public.campaign_channels ADD COLUMN IF NOT EXISTS flow_bot_id uuid;
ALTER TABLE public.flow_bots ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE public.flow_bots ADD COLUMN IF NOT EXISTS flow_type text;
NOTIFY pgrst, 'reload schema';