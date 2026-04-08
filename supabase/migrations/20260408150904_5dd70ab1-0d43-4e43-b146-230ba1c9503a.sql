UPDATE campaign_recipients 
SET status = 'pending', updated_at = now() 
WHERE campaign_id = '7f29576c-c6a7-4c65-a802-9f7cfa72f097' 
AND status = 'processing'