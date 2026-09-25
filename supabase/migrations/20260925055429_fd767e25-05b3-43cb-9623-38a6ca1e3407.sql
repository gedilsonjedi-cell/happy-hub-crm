ALTER TABLE public.leads ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS webchat_id text;
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_webchat_id_uidx ON public.leads (organization_id, webchat_id) WHERE webchat_id IS NOT NULL;