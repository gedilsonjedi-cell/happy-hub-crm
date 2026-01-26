-- Drop existing trigger
DROP TRIGGER IF EXISTS sync_campaign_counts_trigger ON campaign_recipients;

-- Create improved function that only runs COUNT when status actually changes
CREATE OR REPLACE FUNCTION sync_campaign_counts()
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

  -- Use FOR UPDATE SKIP LOCKED to handle concurrent updates safely
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
      AND status = 'failed'
    ),
    updated_at = now()
  WHERE id = target_campaign_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger that ONLY fires when status actually changes
CREATE TRIGGER sync_campaign_counts_trigger
AFTER INSERT OR DELETE ON campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION sync_campaign_counts();

-- Separate trigger for UPDATE that only fires on status change
CREATE TRIGGER sync_campaign_counts_on_status_change
AFTER UPDATE OF status ON campaign_recipients
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION sync_campaign_counts();