
-- Fix the trigger to also fire on UPDATE (not just INSERT/DELETE)
-- This is the root cause of the counter inconsistency

DROP TRIGGER IF EXISTS sync_campaign_counts_trigger ON public.campaign_recipients;

CREATE TRIGGER sync_campaign_counts_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION sync_campaign_counts();
