CREATE INDEX IF NOT EXISTS idx_cr_retry_due ON public.campaign_recipients (next_retry_at) WHERE status = 'retry_pending';
DROP INDEX IF EXISTS public.idx_campaign_recipients_status;