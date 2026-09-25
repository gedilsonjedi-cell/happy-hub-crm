ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS channel_id uuid;
NOTIFY pgrst, 'reload schema';