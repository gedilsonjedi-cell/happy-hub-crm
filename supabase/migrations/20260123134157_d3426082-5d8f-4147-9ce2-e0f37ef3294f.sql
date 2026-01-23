-- Create function to force sync all campaign counts from campaign_recipients
CREATE OR REPLACE FUNCTION public.force_sync_all_campaign_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE campaigns c SET
    sent_count = (
      SELECT COALESCE(SUM(CASE WHEN cr.status IN ('sent', 'delivered', 'read') THEN 1 ELSE 0 END), 0) 
      FROM campaign_recipients cr 
      WHERE cr.campaign_id = c.id
    ),
    delivered_count = (
      SELECT COALESCE(SUM(CASE WHEN cr.status IN ('delivered', 'read') OR cr.delivered_at IS NOT NULL THEN 1 ELSE 0 END), 0) 
      FROM campaign_recipients cr 
      WHERE cr.campaign_id = c.id
    ),
    failed_count = (
      SELECT COALESCE(SUM(CASE WHEN cr.status = 'failed' THEN 1 ELSE 0 END), 0) 
      FROM campaign_recipients cr 
      WHERE cr.campaign_id = c.id
    ),
    updated_at = now()
  WHERE c.status IN ('running', 'completed', 'paused');
END;
$$;