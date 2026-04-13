
-- ============================================================
-- 1. RPC: get_conversations_summary_paginated
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_conversations_summary_paginated(
  p_channel_ids uuid[],
  p_organization_id uuid,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  assignment_updated_at timestamptz,
  is_bot_handling boolean,
  campaign_chatbot_id uuid,
  bot_paused_until timestamptz,
  last_message_content text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count int,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ca.id AS assignment_id,
    ca.conversation_phone,
    ca.channel_id,
    ca.assigned_to,
    ca.status,
    ca.sector_id,
    ca.lead_id,
    ca.updated_at AS assignment_updated_at,
    ca.is_bot_handling,
    ca.campaign_chatbot_id,
    ca.bot_paused_until,
    cs.last_message_content,
    cs.last_message_at,
    cs.last_inbound_at,
    COALESCE(cs.unread_count, 0)::int AS unread_count,
    cs.sender_name,
    l.name AS lead_name,
    l.tags AS lead_tags,
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM conversation_assignments ca
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  WHERE ca.channel_id = ANY(p_channel_ids)
    AND ca.status != 'archived'
  ORDER BY cs.last_message_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- ============================================================
-- 2. RPC: search_conversations_global
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_conversations_global(
  p_channel_ids uuid[],
  p_organization_id uuid,
  p_search_term text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  assignment_updated_at timestamptz,
  is_bot_handling boolean,
  campaign_chatbot_id uuid,
  bot_paused_until timestamptz,
  last_message_content text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count int,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ca.id AS assignment_id,
    ca.conversation_phone,
    ca.channel_id,
    ca.assigned_to,
    ca.status,
    ca.sector_id,
    ca.lead_id,
    ca.updated_at AS assignment_updated_at,
    ca.is_bot_handling,
    ca.campaign_chatbot_id,
    ca.bot_paused_until,
    cs.last_message_content,
    cs.last_message_at,
    cs.last_inbound_at,
    COALESCE(cs.unread_count, 0)::int AS unread_count,
    cs.sender_name,
    l.name AS lead_name,
    l.tags AS lead_tags,
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM conversation_assignments ca
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  WHERE ca.channel_id = ANY(p_channel_ids)
    AND ca.status != 'archived'
    AND (
      ca.conversation_phone ILIKE '%' || p_search_term || '%'
      OR l.name ILIKE '%' || p_search_term || '%'
      OR cs.sender_name ILIKE '%' || p_search_term || '%'
    )
  ORDER BY cs.last_message_at DESC NULLS LAST
  LIMIT p_limit;
$$;

-- ============================================================
-- 3. RPC: cleanup_archived_assignments_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_archived_assignments_batch(
  cutoff_date timestamptz,
  batch_size int DEFAULT 2000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH to_delete AS (
    SELECT id FROM conversation_assignments
    WHERE status = 'archived' AND updated_at < cutoff_date
    LIMIT batch_size
  ),
  del_stats AS (
    DELETE FROM conversation_stats
    WHERE assignment_id IN (SELECT id FROM to_delete)
  )
  DELETE FROM conversation_assignments
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- 4. RPC: cleanup_local_messages_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_local_messages_batch(
  cutoff_date timestamptz,
  batch_size int DEFAULT 5000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM whatsapp_messages
  WHERE id IN (
    SELECT id FROM whatsapp_messages
    WHERE created_at < cutoff_date
    LIMIT batch_size
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- 5. Ensure conversation_stats is in realtime publication
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'conversation_stats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_stats;
  END IF;
END;
$$;
