
-- Fix sync_campaign_counts: waiting_retry should NOT count as "sent"
-- sent_count = only messages actually sent successfully
-- failed_count = permanently failed messages
-- NEW: waiting_retry messages are neither sent nor failed, they're "in progress"
CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER AS $$
DECLARE
  target_campaign_id uuid;
BEGIN
  -- Determine which campaign to update
  IF TG_OP = 'DELETE' THEN
    target_campaign_id := OLD.campaign_id;
  ELSE
    target_campaign_id := NEW.campaign_id;
  END IF;

  -- Update campaign counts based on actual recipient statuses
  -- sent_count: messages successfully sent to Meta API (sent, delivered, read)
  -- delivered_count: messages confirmed delivered or read by recipient
  -- failed_count: messages permanently failed + messages waiting retry (shown as issues)
  UPDATE campaigns
  SET 
    sent_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status IN ('sent', 'delivered', 'read')
    ),
    delivered_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status IN ('delivered', 'read')
    ),
    failed_count = (
      SELECT COUNT(*) FROM campaign_recipients 
      WHERE campaign_id = target_campaign_id 
      AND status IN ('failed', 'waiting_retry')
    ),
    updated_at = now()
  WHERE id = target_campaign_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
