
CREATE OR REPLACE FUNCTION public.get_conversations_summary(p_channel_ids uuid[], p_organization_id uuid)
 RETURNS TABLE(assignment_id uuid, conversation_phone text, channel_id uuid, assigned_to uuid, status text, sector_id uuid, lead_id uuid, updated_at timestamp with time zone, last_message text, last_message_at timestamp with time zone, last_inbound_at timestamp with time zone, unread_count bigint, sender_name text, lead_name text, lead_tags text[], assigned_to_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    cs.last_message_content AS last_message,
    cs.last_message_at,
    cs.last_inbound_at,
    COALESCE(cs.unread_count, 0)::bigint AS unread_count,
    cs.sender_name,
    CASE
      WHEN l.name IS NOT NULL AND l.name NOT LIKE 'LeadWhats-%' AND l.name NOT LIKE 'WhatsApp %'
      THEN l.name
      ELSE NULL
    END AS lead_name,
    l.tags AS lead_tags,
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM conversation_assignments ca
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  WHERE ca.status != 'archived'
    AND (
      -- Conversas COM canal: canal deve estar na lista da organização
      (ca.channel_id IS NOT NULL AND ca.channel_id = ANY(p_channel_ids))
      OR
      -- Conversas SEM canal (órfãs): devem pertencer à organização via lead ou atendente
      (ca.channel_id IS NULL AND (
        (ca.lead_id IS NOT NULL AND l.organization_id = p_organization_id)
        OR
        (ca.assigned_to IS NOT NULL AND p.organization_id = p_organization_id)
      ))
    )
  ORDER BY COALESCE(cs.last_message_at, ca.updated_at) DESC;
END;
$function$;
