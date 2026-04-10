
-- Index 1: conversation_assignments main query (channel + status + ordering)
CREATE INDEX IF NOT EXISTS idx_conv_assignments_channel_status_updated 
ON conversation_assignments(channel_id, status, updated_at DESC)
WHERE status != 'archived';

-- Index 2: whatsapp_messages by channel + created_at (for last message preview)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_channel_created 
ON whatsapp_messages(channel_id, created_at DESC);

-- Index 3: whatsapp_messages by sender_phone for inbound matching
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sender_phone 
ON whatsapp_messages(sender_phone, channel_id, created_at DESC)
WHERE direction = 'inbound';

-- RPC: get_conversations_summary
-- Returns all conversation data in a single call, replacing N+1 queries
CREATE OR REPLACE FUNCTION public.get_conversations_summary(
  p_channel_ids uuid[],
  p_organization_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  updated_at timestamptz,
  last_message text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count bigint,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.id AS assignment_id,
    ca.conversation_phone,
    ca.channel_id,
    ca.assigned_to,
    ca.status,
    ca.sector_id,
    ca.lead_id,
    ca.updated_at,
    -- Last message content (via LATERAL join)
    lm.content AS last_message,
    lm.created_at AS last_message_at,
    -- Last inbound time
    li.created_at AS last_inbound_at,
    -- Unread count
    COALESCE(uc.cnt, 0)::bigint AS unread_count,
    -- Sender name from last inbound
    li.sender_name,
    -- Lead name
    CASE 
      WHEN l.name IS NOT NULL AND l.name NOT LIKE 'LeadWhats-%' AND l.name NOT LIKE 'WhatsApp %' 
      THEN l.name 
      ELSE NULL 
    END AS lead_name,
    -- Lead tags
    l.tags AS lead_tags,
    -- Assigned attendant name
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM conversation_assignments ca
  -- Lead info
  LEFT JOIN leads l ON l.id = ca.lead_id
  -- Profile of assigned attendant
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  -- Last message (any direction)
  LEFT JOIN LATERAL (
    SELECT wm.content, wm.created_at
    FROM whatsapp_messages wm
    WHERE wm.channel_id = ca.channel_id
      AND (
        (wm.direction = 'inbound' AND RIGHT(wm.sender_phone, 8) = RIGHT(ca.conversation_phone, 8))
        OR
        (wm.direction = 'outbound' AND RIGHT(wm.metadata->>'destination', 8) = RIGHT(ca.conversation_phone, 8))
      )
    ORDER BY wm.created_at DESC
    LIMIT 1
  ) lm ON true
  -- Last inbound message
  LEFT JOIN LATERAL (
    SELECT wm2.created_at, wm2.sender_name
    FROM whatsapp_messages wm2
    WHERE wm2.channel_id = ca.channel_id
      AND wm2.direction = 'inbound'
      AND RIGHT(wm2.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
    ORDER BY wm2.created_at DESC
    LIMIT 1
  ) li ON true
  -- Unread count
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM whatsapp_messages wm3
    WHERE wm3.channel_id = ca.channel_id
      AND wm3.direction = 'inbound'
      AND wm3.is_read = false
      AND RIGHT(wm3.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
  ) uc ON true
  WHERE ca.status != 'archived'
    AND (ca.channel_id = ANY(p_channel_ids) OR ca.channel_id IS NULL)
  ORDER BY COALESCE(lm.created_at, ca.updated_at) DESC;
END;
$$;
