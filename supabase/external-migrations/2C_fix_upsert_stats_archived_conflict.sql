-- ============================================================================
-- FIX 2C — upsert_conversation_stats_external
-- Bug: SELECT excluía status='archived', então quando havia linha arquivada
-- (criada pelo disparo da campanha) para o mesmo canal+telefone, o INSERT
-- subsequente colidia com a unique (channel_id, conversation_phone) e a
-- conversation_stats nunca era gravada → conversa não aparecia em "Novos".
--
-- Solução: SELECT considera QUALQUER status. Se a linha encontrada está
-- arquivada e a mensagem é inbound, reabre como 'pending'.
-- COLE NO SQL EDITOR DO BANCO EXTERNO E EXECUTE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_conversation_stats_external(
  _organization_id uuid,
  _channel_id uuid,
  _conversation_phone text,
  _content text,
  _direction text,
  _is_read boolean,
  _sender_name text,
  _created_at timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assignment_id uuid;
  _existing_status text;
  _phone_suffix text := right(regexp_replace(_conversation_phone, '\D', '', 'g'), 8);
BEGIN
  IF _phone_suffix = '' THEN RETURN NULL; END IF;

  -- Find existing assignment (ANY status — including archived)
  SELECT id, status INTO _assignment_id, _existing_status
  FROM conversation_assignments
  WHERE organization_id = _organization_id
    AND channel_id = _channel_id
    AND right(conversation_phone, 8) = _phone_suffix
  ORDER BY (status <> 'archived') DESC, updated_at DESC
  LIMIT 1;

  -- Reopen archived assignments when an inbound arrives
  IF _assignment_id IS NOT NULL
     AND _existing_status = 'archived'
     AND _direction = 'inbound' THEN
    UPDATE conversation_assignments
    SET status = 'pending', updated_at = now()
    WHERE id = _assignment_id;
  END IF;

  -- Auto-create only when no row at all exists
  IF _assignment_id IS NULL AND _direction = 'inbound' THEN
    INSERT INTO conversation_assignments (organization_id, channel_id, conversation_phone, status)
    VALUES (_organization_id, _channel_id, _conversation_phone, 'pending')
    ON CONFLICT (channel_id, conversation_phone) DO UPDATE
      SET status = CASE WHEN conversation_assignments.status = 'archived' THEN 'pending'
                        ELSE conversation_assignments.status END,
          updated_at = now()
    RETURNING id INTO _assignment_id;
  END IF;

  IF _assignment_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO conversation_stats (
    assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at,
    unread_count, sender_name, updated_at
  ) VALUES (
    _assignment_id, _channel_id, _conversation_phone, _organization_id,
    _content, _created_at,
    CASE WHEN _direction = 'inbound' THEN _created_at END,
    CASE WHEN _direction = 'inbound' AND COALESCE(_is_read, false) = false THEN 1 ELSE 0 END,
    CASE WHEN _direction = 'inbound' THEN _sender_name END,
    now()
  )
  ON CONFLICT (assignment_id) DO UPDATE SET
    last_message_content = CASE
      WHEN _created_at >= COALESCE(conversation_stats.last_message_at, '1970-01-01'::timestamptz)
      THEN _content ELSE conversation_stats.last_message_content END,
    last_message_at = GREATEST(_created_at, conversation_stats.last_message_at),
    last_inbound_at = CASE WHEN _direction = 'inbound'
      THEN GREATEST(_created_at, conversation_stats.last_inbound_at)
      ELSE conversation_stats.last_inbound_at END,
    unread_count = CASE
      WHEN _direction = 'inbound' AND COALESCE(_is_read, false) = false
      THEN conversation_stats.unread_count + 1
      ELSE conversation_stats.unread_count END,
    sender_name = CASE WHEN _direction = 'inbound'
      AND _created_at >= COALESCE(conversation_stats.last_inbound_at, '1970-01-01'::timestamptz)
      THEN _sender_name ELSE conversation_stats.sender_name END,
    updated_at = now();

  RETURN _assignment_id;
END;
$$;

-- ─── Backfill: gerar conversation_stats para os pending órfãos ───────────────
-- Pega a última whatsapp_messages de cada assignment pending sem stats e cria a row.
INSERT INTO conversation_stats (
  assignment_id, channel_id, conversation_phone, organization_id,
  last_message_content, last_message_at, last_inbound_at,
  unread_count, sender_name, updated_at
)
SELECT
  ca.id,
  ca.channel_id,
  ca.conversation_phone,
  ca.organization_id,
  m.content,
  m.created_at,
  CASE WHEN m.direction = 'inbound' THEN m.created_at END,
  CASE WHEN m.direction = 'inbound' AND COALESCE(m.is_read, false) = false THEN 1 ELSE 0 END,
  CASE WHEN m.direction = 'inbound' THEN m.sender_name END,
  now()
FROM conversation_assignments ca
LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
LEFT JOIN LATERAL (
  SELECT content, created_at, direction, sender_name, is_read
  FROM whatsapp_messages
  WHERE channel_id = ca.channel_id
    AND right(regexp_replace(sender_phone, '\D', '', 'g'), 8) = right(ca.conversation_phone, 8)
  ORDER BY created_at DESC
  LIMIT 1
) m ON true
WHERE cs.id IS NULL
  AND ca.status <> 'archived'
  AND m.created_at IS NOT NULL
ON CONFLICT (assignment_id) DO NOTHING;
