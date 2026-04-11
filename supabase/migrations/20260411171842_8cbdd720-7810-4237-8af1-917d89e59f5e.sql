
CREATE OR REPLACE FUNCTION public.upsert_conversation_stats_manual(
  _channel_id uuid,
  _conversation_phone text,
  _content text,
  _direction text,
  _is_read boolean,
  _sender_name text,
  _created_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _assignment_id uuid;
  _org_id uuid;
  _phone_suffix text;
  _conv_phone text;
BEGIN
  -- Extract phone suffix for matching
  IF _direction = 'inbound' THEN
    _phone_suffix := RIGHT(_conversation_phone, 8);
  ELSE
    _phone_suffix := RIGHT(_conversation_phone, 8);
  END IF;

  IF _phone_suffix IS NULL OR _phone_suffix = '' THEN
    RETURN;
  END IF;

  -- Find matching assignment
  SELECT ca.id, ca.conversation_phone INTO _assignment_id, _conv_phone
  FROM conversation_assignments ca
  WHERE ca.channel_id = _channel_id
    AND ca.status != 'archived'
    AND RIGHT(ca.conversation_phone, 8) = _phone_suffix
  LIMIT 1;

  IF _assignment_id IS NULL THEN
    RETURN;
  END IF;

  -- Get organization_id from channel
  SELECT c.organization_id INTO _org_id
  FROM channels c WHERE c.id = _channel_id;

  -- Upsert stats (same logic as the trigger)
  INSERT INTO conversation_stats (
    assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at,
    unread_count, sender_name, updated_at
  )
  VALUES (
    _assignment_id, _channel_id, _conv_phone, _org_id,
    _content, _created_at,
    CASE WHEN _direction = 'inbound' THEN _created_at ELSE NULL END,
    CASE WHEN _direction = 'inbound' AND (_is_read IS NULL OR _is_read = false) THEN 1 ELSE 0 END,
    CASE WHEN _direction = 'inbound' THEN _sender_name ELSE NULL END,
    now()
  )
  ON CONFLICT (assignment_id) DO UPDATE SET
    last_message_content = CASE
      WHEN _created_at >= COALESCE(conversation_stats.last_message_at, '1970-01-01'::timestamptz)
      THEN _content
      ELSE conversation_stats.last_message_content
    END,
    last_message_at = GREATEST(_created_at, conversation_stats.last_message_at),
    last_inbound_at = CASE
      WHEN _direction = 'inbound' THEN GREATEST(_created_at, conversation_stats.last_inbound_at)
      ELSE conversation_stats.last_inbound_at
    END,
    unread_count = CASE
      WHEN _direction = 'inbound' AND (_is_read IS NULL OR _is_read = false)
      THEN conversation_stats.unread_count + 1
      ELSE conversation_stats.unread_count
    END,
    sender_name = CASE
      WHEN _direction = 'inbound' AND _created_at >= COALESCE(conversation_stats.last_inbound_at, '1970-01-01'::timestamptz)
      THEN _sender_name
      ELSE conversation_stats.sender_name
    END,
    updated_at = now();
END;
$$;
