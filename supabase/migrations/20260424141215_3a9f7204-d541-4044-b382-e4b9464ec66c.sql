-- RPC dedicada para listar TODAS as conversas com unread_count > 0
-- sem paginação, para alimentar a aba "Não Lidos" do Atendimento V2.
-- Mantém o mesmo schema de retorno de get_conversations_summary_paginated.
CREATE OR REPLACE FUNCTION public.get_unread_conversations_full(
  p_channel_ids uuid[],
  p_organization_id uuid
)
RETURNS TABLE(
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  assignment_updated_at timestamp with time zone,
  is_bot_handling boolean,
  campaign_chatbot_id uuid,
  bot_paused_until timestamp with time zone,
  last_message_content text,
  last_message_at timestamp with time zone,
  last_inbound_at timestamp with time zone,
  unread_count integer,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
  JOIN conversation_stats cs ON cs.assignment_id = ca.id
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  WHERE ca.channel_id = ANY(p_channel_ids)
    AND ca.status != 'archived'
    AND COALESCE(cs.unread_count, 0) > 0
  ORDER BY cs.last_inbound_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_conversations_full(uuid[], uuid) TO authenticated;