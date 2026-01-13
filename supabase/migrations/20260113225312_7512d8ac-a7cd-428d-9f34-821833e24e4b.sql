-- Add retry columns to campaign_recipients for handling Meta error 131049
ALTER TABLE public.campaign_recipients 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_error_code text;

-- Create index for efficient retry queries
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_retry 
ON public.campaign_recipients (campaign_id, status, next_retry_at) 
WHERE status = 'retry_pending';

-- Comment explaining the retry logic
COMMENT ON COLUMN public.campaign_recipients.retry_count IS 'Number of retry attempts made for this recipient';
COMMENT ON COLUMN public.campaign_recipients.next_retry_at IS 'When to attempt the next retry (uses exponential backoff)';
COMMENT ON COLUMN public.campaign_recipients.last_error_code IS 'Last Meta error code (e.g., 131049 for rate limiting)';