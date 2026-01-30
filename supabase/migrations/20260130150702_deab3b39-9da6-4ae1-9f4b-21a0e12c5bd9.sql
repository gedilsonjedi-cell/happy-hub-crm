
-- Fix the sync_campaign_counts function to include waiting_retry in sent_count
-- This fixes the bug where counters reset to zero when messages go to retry status

CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_campaign_id uuid;
BEGIN
  -- Determine which campaign to update
  IF TG_OP = 'DELETE' THEN
    target_campaign_id := OLD.campaign_id;
  ELSE
    target_campaign_id := NEW.campaign_id;
  END IF;

  -- Update campaign counts
  -- sent_count: messages that were sent (includes those awaiting retry or delivered)
  -- delivered_count: messages confirmed delivered or read
  -- failed_count: messages permanently failed (not retryable)
  UPDATE campaigns
  SET 
    sent_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status IN ('sent', 'delivered', 'read', 'waiting_retry')
    ),
    delivered_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status IN ('delivered', 'read')
    ),
    failed_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status = 'failed'
    ),
    updated_at = now()
  WHERE id = target_campaign_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
