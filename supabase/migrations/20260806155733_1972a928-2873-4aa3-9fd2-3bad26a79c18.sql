ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS auto_blacklist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS decline_message_enabled boolean NOT NULL DEFAULT true;