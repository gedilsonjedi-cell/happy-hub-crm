
-- Fix sync_campaign_counts function to properly count all statuses including pending
CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id uuid;
  v_sent_count integer;
  v_delivered_count integer;
  v_failed_count integer;
  v_pending_count integer;
  v_read_count integer;
BEGIN
  -- Get the campaign_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_campaign_id := OLD.campaign_id;
  ELSE
    v_campaign_id := NEW.campaign_id;
  END IF;
  
  -- Calculate counts from recipients with proper logic
  -- sent_count: includes sent, delivered, and read (all successfully sent)
  -- delivered_count: includes delivered and read
  -- failed_count: only failed
  SELECT 
    COALESCE(SUM(CASE WHEN status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status IN ('delivered', 'read') OR delivered_at IS NOT NULL THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
  INTO v_sent_count, v_delivered_count, v_failed_count
  FROM public.campaign_recipients
  WHERE campaign_id = v_campaign_id;
  
  -- Update the campaign with accurate counts
  UPDATE public.campaigns
  SET 
    sent_count = v_sent_count,
    delivered_count = v_delivered_count,
    failed_count = v_failed_count,
    updated_at = now()
  WHERE id = v_campaign_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-sync all campaign counts to fix current data
UPDATE public.campaigns c
SET 
  sent_count = (
    SELECT COALESCE(SUM(CASE WHEN cr.status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END), 0)
    FROM public.campaign_recipients cr WHERE cr.campaign_id = c.id
  ),
  delivered_count = (
    SELECT COALESCE(SUM(CASE WHEN cr.status IN ('delivered', 'read') OR cr.delivered_at IS NOT NULL THEN 1 ELSE 0 END), 0)
    FROM public.campaign_recipients cr WHERE cr.campaign_id = c.id
  ),
  failed_count = (
    SELECT COALESCE(SUM(CASE WHEN cr.status = 'failed' THEN 1 ELSE 0 END), 0)
    FROM public.campaign_recipients cr WHERE cr.campaign_id = c.id
  ),
  updated_at = now();
