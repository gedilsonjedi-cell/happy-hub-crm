
-- Index para acelerar RIGHT(phone, 8) lookups
CREATE INDEX IF NOT EXISTS idx_leads_phone_suffix ON leads (RIGHT(phone, 8));
CREATE INDEX IF NOT EXISTS idx_cr_phone_suffix ON campaign_recipients (RIGHT(phone, 8));
CREATE INDEX IF NOT EXISTS idx_wm_sender_suffix ON whatsapp_messages (RIGHT(sender_phone, 8)) WHERE direction = 'inbound';

-- Rewrite function: two-phase approach with smaller batch and simpler logic
CREATE OR REPLACE FUNCTION public.cleanup_unresponsive_campaign_leads(
  days_threshold int DEFAULT 10,
  batch_size int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  lead_rec RECORD;
  deleted_count int := 0;
  skipped_count int := 0;
  phone_suffix text;
  has_response boolean;
BEGIN
  -- Phase 1: Find candidate leads (simple indexed query)
  FOR lead_rec IN
    SELECT l.id as lead_id, l.phone, l.organization_id
    FROM leads l
    WHERE EXISTS (
      SELECT 1 FROM campaign_recipients cr
      JOIN campaigns c ON c.id = cr.campaign_id
      WHERE c.organization_id = l.organization_id
        AND cr.phone = l.phone
        AND cr.sent_at IS NOT NULL
        AND cr.sent_at < now() - (days_threshold || ' days')::interval
        AND cr.button_clicked IS NULL
    )
    LIMIT batch_size
  LOOP
    phone_suffix := RIGHT(lead_rec.phone, 8);
    
    -- Check inbound messages
    SELECT EXISTS (
      SELECT 1 FROM whatsapp_messages wm
      JOIN channels ch ON ch.id = wm.channel_id AND ch.organization_id = lead_rec.organization_id
      WHERE wm.direction = 'inbound'
        AND RIGHT(wm.sender_phone, 8) = phone_suffix
      LIMIT 1
    ) INTO has_response;
    
    IF has_response THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;
    
    -- Delete all related data for this lead
    DELETE FROM whatsapp_messages WHERE id IN (
      SELECT wm.id FROM whatsapp_messages wm
      JOIN channels ch ON ch.id = wm.channel_id AND ch.organization_id = lead_rec.organization_id
      WHERE RIGHT(wm.sender_phone, 8) = phone_suffix
         OR (wm.metadata->>'destination' IS NOT NULL AND RIGHT(wm.metadata->>'destination', 8) = phone_suffix)
    );
    
    DELETE FROM conversation_assignments WHERE lead_id = lead_rec.lead_id;
    DELETE FROM conversation_notes WHERE organization_id = lead_rec.organization_id 
      AND RIGHT(contact_phone, 8) = phone_suffix;
    DELETE FROM lead_activity_log WHERE lead_id = lead_rec.lead_id;
    DELETE FROM client_portfolios WHERE lead_id = lead_rec.lead_id;
    DELETE FROM follow_up_instances WHERE lead_id = lead_rec.lead_id;
    DELETE FROM conversation_metrics WHERE lead_id = lead_rec.lead_id;
    DELETE FROM chat_conversations WHERE lead_id = lead_rec.lead_id;
    DELETE FROM campaign_recipients WHERE phone = lead_rec.phone
      AND campaign_id IN (SELECT id FROM campaigns WHERE organization_id = lead_rec.organization_id);
    
    DELETE FROM leads WHERE id = lead_rec.lead_id;
    
    deleted_count := deleted_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'deleted_leads', deleted_count,
    'skipped_responded', skipped_count,
    'batch_size', batch_size,
    'days_threshold', days_threshold
  );
END;
$$;
