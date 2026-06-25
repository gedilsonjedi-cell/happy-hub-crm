CREATE INDEX IF NOT EXISTS idx_leads_org_tags_gin
ON public.leads USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_leads_org_updated_created
ON public.leads (organization_id, updated_at DESC, created_at DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_lead_tags_org_created
ON public.lead_tags (organization_id, created_at DESC, id ASC);