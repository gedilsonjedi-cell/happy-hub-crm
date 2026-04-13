
-- Create a function to backfill missing conversation_stats records
-- This creates stub entries so conversations appear in the sidebar
CREATE OR REPLACE FUNCTION backfill_missing_conversation_stats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  INSERT INTO conversation_stats (
    assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at,
    unread_count, sender_name, updated_at
  )
  SELECT
    ca.id,
    ca.channel_id,
    ca.conversation_phone,
    ch.organization_id,
    NULL,
    ca.updated_at,
    CASE WHEN ca.status = 'pending' AND ca.assigned_to IS NULL THEN ca.updated_at ELSE NULL END,
    CASE WHEN ca.status = 'pending' THEN 1 ELSE 0 END,
    NULL,
    now()
  FROM conversation_assignments ca
  JOIN channels ch ON ch.id = ca.channel_id
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  WHERE cs.id IS NULL
    AND ca.status != 'archived'
    AND ca.channel_id IS NOT NULL
  ON CONFLICT (assignment_id) DO NOTHING;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

SELECT backfill_missing_conversation_stats();
