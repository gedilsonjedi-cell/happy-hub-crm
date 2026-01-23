-- Create function to sync failed recipients from whatsapp_messages
-- This fixes historical data where whatsapp_messages is 'failed' but campaign_recipients is still 'sent'
CREATE OR REPLACE FUNCTION public.sync_failed_recipients_from_messages()
RETURNS TABLE(updated_count integer, campaign_id uuid, campaign_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campaign RECORD;
  v_count integer;
BEGIN
  -- For each campaign, find recipients that should be marked as failed
  FOR v_campaign IN 
    SELECT c.id, c.name 
    FROM campaigns c 
    WHERE c.status IN ('running', 'completed', 'paused')
  LOOP
    -- Update campaign_recipients to failed where the corresponding whatsapp_message is failed
    WITH failed_messages AS (
      SELECT 
        wm.metadata->>'campaignId' as msg_campaign_id,
        wm.sender_phone,
        wm.error_message,
        COALESCE((wm.metadata->>'webhookErrorCode')::text, 'SYNC_FAILED') as error_code
      FROM whatsapp_messages wm
      WHERE wm.direction = 'outbound'
        AND wm.status = 'failed'
        AND wm.metadata->>'campaignId' = v_campaign.id::text
    )
    UPDATE campaign_recipients cr
    SET 
      status = 'failed',
      error_message = COALESCE(fm.error_message, 'Falha sincronizada do histórico'),
      last_error_code = fm.error_code,
      updated_at = NOW()
    FROM failed_messages fm
    WHERE cr.campaign_id = v_campaign.id
      AND cr.status IN ('sent', 'pending')
      AND (
        -- Match by phone suffix (last 8-11 digits)
        RIGHT(cr.phone, 8) = RIGHT(regexp_replace(fm.sender_phone, '\D', '', 'g'), 8)
        OR RIGHT(cr.phone, 11) = RIGHT(regexp_replace(fm.sender_phone, '\D', '', 'g'), 11)
      );
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    IF v_count > 0 THEN
      updated_count := v_count;
      campaign_id := v_campaign.id;
      campaign_name := v_campaign.name;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- Also create a simpler version that just returns the total count
CREATE OR REPLACE FUNCTION public.sync_all_failed_recipients()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total integer := 0;
  v_count integer;
BEGIN
  -- Update all campaign_recipients to failed where whatsapp_message is failed
  UPDATE campaign_recipients cr
  SET 
    status = 'failed',
    error_message = COALESCE(wm.error_message, 'Falha sincronizada do histórico'),
    last_error_code = COALESCE((wm.metadata->>'webhookErrorCode')::text, 'SYNC_FAILED'),
    updated_at = NOW()
  FROM whatsapp_messages wm
  WHERE wm.direction = 'outbound'
    AND wm.status = 'failed'
    AND wm.metadata->>'campaignId' = cr.campaign_id::text
    AND cr.status IN ('sent', 'pending')
    AND (
      RIGHT(cr.phone, 8) = RIGHT(regexp_replace(wm.sender_phone, '\D', '', 'g'), 8)
      OR RIGHT(cr.phone, 11) = RIGHT(regexp_replace(wm.sender_phone, '\D', '', 'g'), 11)
    );
  
  GET DIAGNOSTICS v_total = ROW_COUNT;
  
  -- The sync_campaign_counts trigger will automatically update campaign counters
  
  RETURN v_total;
END;
$$;