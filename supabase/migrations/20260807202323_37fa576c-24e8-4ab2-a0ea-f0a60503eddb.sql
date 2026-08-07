ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS bsuid text;
ALTER TABLE public.leads ALTER COLUMN phone DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_org_bsuid_unique ON public.leads (organization_id, bsuid) WHERE bsuid IS NOT NULL;