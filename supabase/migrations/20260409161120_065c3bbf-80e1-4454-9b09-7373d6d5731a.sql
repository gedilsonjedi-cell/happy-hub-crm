
-- Add api_token column to channels for external API authentication
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS api_token TEXT UNIQUE;

-- Generate tokens for existing channels
UPDATE public.channels 
SET api_token = encode(gen_random_bytes(32), 'hex')
WHERE api_token IS NULL;

-- Create function to regenerate api token
CREATE OR REPLACE FUNCTION public.regenerate_channel_api_token(_channel_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_token text;
BEGIN
  _new_token := encode(gen_random_bytes(32), 'hex');
  
  UPDATE channels SET api_token = _new_token WHERE id = _channel_id;
  
  RETURN _new_token;
END;
$$;

-- Helper: resolve channel from api_token (used by edge functions)
CREATE OR REPLACE FUNCTION public.get_channel_by_api_token(_token text)
RETURNS TABLE(
  id uuid,
  name text,
  phone text,
  provider text,
  access_token text,
  waba_id text,
  organization_id uuid,
  user_id uuid,
  app_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.name, c.phone, c.provider, c.access_token, c.waba_id, 
         c.organization_id, c.user_id, c.app_name
  FROM channels c
  WHERE c.api_token = _token AND c.connected = true
  LIMIT 1;
$$;
