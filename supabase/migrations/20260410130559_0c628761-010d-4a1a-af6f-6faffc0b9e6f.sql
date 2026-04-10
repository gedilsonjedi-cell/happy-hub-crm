
CREATE OR REPLACE FUNCTION public.cleanup_unresponsive_campaign_leads(
  days_threshold int DEFAULT 10,
  batch_size int DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_rec RECORD;
  deleted_count int := 0;
  phone_suffix text;
  has_response boolean;
BEGIN
  FOR lead_rec IN
    SELECT DISTINCT l.id as lead_id, l.phone, l.organization_id
    FROM leads l
    JOIN campaign_recipients cr ON RIGHT(l.phone, 8) = RIGHT(cr.phone, 8)
    JOIN campaigns c ON c.id = cr.campaign_id AND c.organization_id = l.organization_id
    WHERE cr.sent_at IS NOT NULL
      AND cr.sent_at < now() - (days_threshold || ' days')::interval
      AND cr.button_clicked IS NULL
    LIMIT batch_size
  LOOP
    phone_suffix := RIGHT(lead_rec.phone, 8);
    
    -- Check if this lead ever sent an inbound message on any channel of their org
    SELECT EXISTS (
      SELECT 1 FROM whatsapp_messages wm
      JOIN channels ch ON ch.id = wm.channel_id
      WHERE ch.organization_id = lead_rec.organization_id
        AND wm.direction = 'inbound'
        AND RIGHT(wm.sender_phone, 8) = phone_suffix
      LIMIT 1
    ) INTO has_response;
    
    -- Also check if any campaign_recipient for this phone had a button click
    IF NOT has_response THEN
      SELECT EXISTS (
        SELECT 1 FROM campaign_recipients cr2
        WHERE RIGHT(cr2.phone, 8) = phone_suffix
          AND cr2.button_clicked IS NOT NULL
        LIMIT 1
      ) INTO has_response;
    END IF;
    
    IF has_response THEN
      CONTINUE;
    END IF;
    
    -- Delete all related data
    DELETE FROM whatsapp_messages WHERE channel_id IN (
      SELECT id FROM channels WHERE organization_id = lead_rec.organization_id
    ) AND (
      RIGHT(sender_phone, 8) = phone_suffix 
      OR (metadata->>'destination') IS NOT NULL AND RIGHT(metadata->>'destination', 8) = phone_suffix
    );
    
    DELETE FROM conversation_assignments WHERE lead_id = lead_rec.lead_id;
    DELETE FROM conversation_assignments WHERE RIGHT(conversation_phone, 8) = phone_suffix
      AND channel_id IN (SELECT id FROM channels WHERE organization_id = lead_rec.organization_id);
    
    DELETE FROM conversation_notes WHERE RIGHT(contact_phone, 8) = phone_suffix
      AND organization_id = lead_rec.organization_id;
    
    DELETE FROM lead_activity_log WHERE lead_id = lead_rec.lead_id;
    DELETE FROM client_portfolios WHERE lead_id = lead_rec.lead_id;
    DELETE FROM follow_up_instances WHERE lead_id = lead_rec.lead_id;
    DELETE FROM campaign_recipients WHERE lead_id = lead_rec.lead_id;
    DELETE FROM campaign_recipients WHERE RIGHT(phone, 8) = phone_suffix
      AND campaign_id IN (SELECT id FROM campaigns WHERE organization_id = lead_rec.organization_id);
    DELETE FROM conversation_metrics WHERE lead_id = lead_rec.lead_id;
    DELETE FROM chat_conversations WHERE lead_id = lead_rec.lead_id;
    
    DELETE FROM leads WHERE id = lead_rec.lead_id;
    
    deleted_count := deleted_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'deleted_leads', deleted_count,
    'batch_size', batch_size,
    'days_threshold', days_threshold
  );
END;
$$;
