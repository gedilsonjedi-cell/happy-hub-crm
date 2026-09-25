CREATE OR REPLACE FUNCTION public.upsert_conversation_stats_external(_organization_id uuid, _channel_id uuid, _conversation_phone text, _content text, _direction text, _is_read boolean, _sender_name text, _created_at timestamp with time zone DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _assignment_id uuid;
  _is_webchat boolean := _conversation_phone LIKE 'webchat:%';
  _phone_suffix text := right(regexp_replace(_conversation_phone, '\D', '', 'g'), 8);
BEGIN
  PERFORM public.assert_org_access(_organization_id);
  IF NOT _is_webchat AND _phone_suffix = '' THEN RETURN NULL; END IF;
  SELECT id INTO _assignment_id FROM conversation_assignments
  WHERE organization_id = _organization_id AND channel_id = _channel_id AND status != 'archived'
    AND (CASE WHEN _is_webchat THEN conversation_phone = _conversation_phone
              ELSE conversation_phone NOT LIKE 'webchat:%' AND right(conversation_phone, 8) = _phone_suffix END)
  LIMIT 1;
  IF _assignment_id IS NULL AND _is_webchat THEN
    SELECT id INTO _assignment_id FROM conversation_assignments
    WHERE organization_id = _organization_id AND channel_id = _channel_id AND conversation_phone = _conversation_phone LIMIT 1;
  END IF;
  IF _assignment_id IS NULL AND _direction = 'inbound' THEN
    INSERT INTO conversation_assignments (organization_id, channel_id, conversation_phone, status)
    VALUES (_organization_id, _channel_id, _conversation_phone, 'pending') RETURNING id INTO _assignment_id;
  END IF;
  IF _assignment_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO conversation_stats (assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at, unread_count, sender_name, updated_at)
  VALUES (_assignment_id, _channel_id, _conversation_phone, _organization_id, _content, _created_at,
    CASE WHEN _direction = 'inbound' THEN _created_at END,
    CASE WHEN _direction = 'inbound' AND COALESCE(_is_read, false) = false THEN 1 ELSE 0 END,
    CASE WHEN _direction = 'inbound' THEN _sender_name END, now())
  ON CONFLICT (assignment_id) DO UPDATE SET
    last_message_content = CASE WHEN _created_at >= COALESCE(conversation_stats.last_message_at, '1970-01-01'::timestamptz) THEN _content ELSE conversation_stats.last_message_content END,
    last_message_at = GREATEST(_created_at, conversation_stats.last_message_at),
    last_inbound_at = CASE WHEN _direction = 'inbound' THEN GREATEST(_created_at, conversation_stats.last_inbound_at) ELSE conversation_stats.last_inbound_at END,
    unread_count = CASE WHEN _direction = 'inbound' AND COALESCE(_is_read, false) = false THEN conversation_stats.unread_count + 1 ELSE conversation_stats.unread_count END,
    sender_name = CASE WHEN _direction = 'inbound' AND _created_at >= COALESCE(conversation_stats.last_inbound_at, '1970-01-01'::timestamptz) THEN _sender_name ELSE conversation_stats.sender_name END,
    updated_at = now();
  RETURN _assignment_id;
END; $function$;