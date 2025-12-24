-- Add webhook_verify_token column to channels for Meta integration
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT;

-- Add comment explaining the fields usage for Meta
COMMENT ON COLUMN public.channels.access_token IS 'For Meta: permanent access token. For Gupshup: API key';
COMMENT ON COLUMN public.channels.app_name IS 'For Meta: Phone Number ID. For Gupshup: app name';
COMMENT ON COLUMN public.channels.webhook_verify_token IS 'For Meta: webhook verification token (auto-generated)';