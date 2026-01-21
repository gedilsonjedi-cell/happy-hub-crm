-- Create or replace function to sync campaign counts from recipients
CREATE OR REPLACE FUNCTION public.sync_campaign_counts()
RETURNS TRIGGER AS $$
DECLARE
  v_campaign_id uuid;
  v_sent_count integer;
  v_delivered_count integer;
  v_failed_count integer;
BEGIN
  -- Get the campaign_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_campaign_id := OLD.campaign_id;
  ELSE
    v_campaign_id := NEW.campaign_id;
  END IF;
  
  -- Calculate counts from recipients
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

-- Create trigger to auto-sync counts on recipient changes
DROP TRIGGER IF EXISTS sync_campaign_counts_trigger ON public.campaign_recipients;
CREATE TRIGGER sync_campaign_counts_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.sync_campaign_counts();

-- Fix current campaign counts by running a one-time sync
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