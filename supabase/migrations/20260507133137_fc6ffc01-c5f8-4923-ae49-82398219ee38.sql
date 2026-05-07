
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_org ON public.campaigns(status, organization_id);
CREATE INDEX IF NOT EXISTS idx_cr_pending_claim ON public.campaign_recipients(campaign_id, channel_id, status) WHERE status = 'pending';
