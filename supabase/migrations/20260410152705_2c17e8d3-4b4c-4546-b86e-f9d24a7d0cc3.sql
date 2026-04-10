
CREATE OR REPLACE FUNCTION public.get_conversations_summary(p_channel_ids uuid[], p_organization_id uuid)
 RETURNS TABLE(assignment_id uuid, conversation_phone text, channel_id uuid, assigned_to uuid, status text, sector_id uuid, lead_id uuid, updated_at timestamp with time zone, last_message text, last_message_at timestamp with time zone, last_inbound_at timestamp with time zone, unread_count bigint, sender_name text, lead_name text, lead_tags text[], assigned_to_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH active_assignments AS (
    SELECT ca.*
    FROM conversation_assignments ca
    WHERE ca.status != 'archived'
      AND (ca.channel_id = ANY(p_channel_ids) OR ca.channel_id IS NULL)
  )
  SELECT
    ca.id AS assignment_id,
    ca.conversation_phone,
    ca.channel_id,
    ca.assigned_to,
    ca.status,
    ca.sector_id,
    ca.lead_id,
    ca.updated_at,
    lm.content AS last_message,
    lm.created_at AS last_message_at,
    li.created_at AS last_inbound_at,
    COALESCE(uc.cnt, 0)::bigint AS unread_count,
    li.sender_name,
    CASE
      WHEN l.name IS NOT NULL AND l.name NOT LIKE 'LeadWhats-%' AND l.name NOT LIKE 'WhatsApp %'
      THEN l.name
      ELSE NULL
    END AS lead_name,
    l.tags AS lead_tags,
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM active_assignments ca
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  LEFT JOIN LATERAL (
    SELECT wm.content, wm.created_at
    FROM whatsapp_messages wm
    WHERE wm.channel_id = ca.channel_id
      AND wm.created_at > now() - interval '30 days'
      AND (
        (wm.direction = 'inbound' AND RIGHT(wm.sender_phone, 8) = RIGHT(ca.conversation_phone, 8))
        OR
        (wm.direction = 'outbound' AND RIGHT(wm.metadata->>'destination', 8) = RIGHT(ca.conversation_phone, 8))
      )
    ORDER BY wm.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT wm2.created_at, wm2.sender_name
    FROM whatsapp_messages wm2
    WHERE wm2.channel_id = ca.channel_id
      AND wm2.direction = 'inbound'
      AND RIGHT(wm2.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
      AND wm2.created_at > now() - interval '30 days'
    ORDER BY wm2.created_at DESC
    LIMIT 1
  ) li ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM whatsapp_messages wm3
    WHERE wm3.channel_id = ca.channel_id
      AND wm3.direction = 'inbound'
      AND wm3.is_read = false
      AND RIGHT(wm3.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
  ) uc ON true
  ORDER BY COALESCE(lm.created_at, ca.updated_at) DESC;
END;
$function$;
