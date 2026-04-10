
-- ============================================================
-- 1. CONVERSATION_STATS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES conversation_assignments(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id),
  conversation_phone text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  last_message_content text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  sender_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assignment_id)
);

-- Indexes for fast reads
CREATE INDEX idx_conv_stats_org_last_msg ON conversation_stats(organization_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_conv_stats_channel ON conversation_stats(channel_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_conv_stats_assignment ON conversation_stats(assignment_id);

-- RLS
ALTER TABLE conversation_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read conversation stats for their org"
ON conversation_stats FOR SELECT TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

-- ============================================================
-- 2. LIGHTWEIGHT TRIGGER ON whatsapp_messages
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_conversation_stats_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _assignment_id uuid;
  _org_id uuid;
  _phone_suffix text;
BEGIN
  -- Extract phone suffix for matching
  IF NEW.direction = 'inbound' THEN
    _phone_suffix := RIGHT(NEW.sender_phone, 8);
  ELSE
    _phone_suffix := RIGHT(NEW.metadata->>'destination', 8);
  END IF;

  -- Skip if no phone suffix
  IF _phone_suffix IS NULL OR _phone_suffix = '' THEN
    RETURN NEW;
  END IF;

  -- Find the matching assignment
  SELECT ca.id, ca.channel_id INTO _assignment_id
  FROM conversation_assignments ca
  WHERE ca.channel_id = NEW.channel_id
    AND ca.status != 'archived'
    AND RIGHT(ca.conversation_phone, 8) = _phone_suffix
  LIMIT 1;

  IF _assignment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get organization_id from channel
  SELECT c.organization_id INTO _org_id
  FROM channels c WHERE c.id = NEW.channel_id;

  -- Upsert stats
  INSERT INTO conversation_stats (
    assignment_id, channel_id, conversation_phone, organization_id,
    last_message_content, last_message_at, last_inbound_at,
    unread_count, sender_name, updated_at
  )
  VALUES (
    _assignment_id, NEW.channel_id,
    (SELECT ca.conversation_phone FROM conversation_assignments ca WHERE ca.id = _assignment_id),
    _org_id,
    NEW.content,
    NEW.created_at,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at ELSE NULL END,
    CASE WHEN NEW.direction = 'inbound' AND NEW.is_read = false THEN 1 ELSE 0 END,
    CASE WHEN NEW.direction = 'inbound' THEN NEW.sender_name ELSE NULL END,
    now()
  )
  ON CONFLICT (assignment_id) DO UPDATE SET
    last_message_content = CASE
      WHEN NEW.created_at >= COALESCE(conversation_stats.last_message_at, '1970-01-01'::timestamptz)
      THEN NEW.content
      ELSE conversation_stats.last_message_content
    END,
    last_message_at = GREATEST(NEW.created_at, conversation_stats.last_message_at),
    last_inbound_at = CASE
      WHEN NEW.direction = 'inbound' THEN GREATEST(NEW.created_at, conversation_stats.last_inbound_at)
      ELSE conversation_stats.last_inbound_at
    END,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' AND NEW.is_read = false
      THEN conversation_stats.unread_count + 1
      ELSE conversation_stats.unread_count
    END,
    sender_name = CASE
      WHEN NEW.direction = 'inbound' AND NEW.created_at >= COALESCE(conversation_stats.last_inbound_at, '1970-01-01'::timestamptz)
      THEN NEW.sender_name
      ELSE conversation_stats.sender_name
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conv_stats
AFTER INSERT ON whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_stats_on_message();

-- ============================================================
-- 3. TRIGGER TO DECREMENT UNREAD ON READ
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_conversation_stats_on_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _phone_suffix text;
BEGIN
  -- Only care about inbound messages being marked as read
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;
  IF OLD.is_read = true OR NEW.is_read = false THEN RETURN NEW; END IF;

  _phone_suffix := RIGHT(NEW.sender_phone, 8);

  UPDATE conversation_stats cs
  SET unread_count = GREATEST(0, cs.unread_count - 1),
      updated_at = now()
  FROM conversation_assignments ca
  WHERE cs.assignment_id = ca.id
    AND ca.channel_id = NEW.channel_id
    AND RIGHT(ca.conversation_phone, 8) = _phone_suffix;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conv_stats_read
AFTER UPDATE OF is_read ON whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_stats_on_read();

-- ============================================================
-- 4. OPTIMIZED get_conversations_summary (NO LATERAL JOINS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_conversations_summary(p_channel_ids uuid[], p_organization_id uuid)
RETURNS TABLE(
  assignment_id uuid, conversation_phone text, channel_id uuid,
  assigned_to uuid, status text, sector_id uuid, lead_id uuid,
  updated_at timestamptz, last_message text, last_message_at timestamptz,
  last_inbound_at timestamptz, unread_count bigint, sender_name text,
  lead_name text, lead_tags text[], assigned_to_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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
    AND (ca.channel_id = ANY(p_channel_ids) OR ca.channel_id IS NULL)
  ORDER BY COALESCE(cs.last_message_at, ca.updated_at) DESC;
END;
$$;

-- ============================================================
-- 5. BACKFILL FUNCTION (run once to populate existing data)
-- ============================================================
CREATE OR REPLACE FUNCTION public.backfill_conversation_stats(batch_size int DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _processed int := 0;
  _rec RECORD;
BEGIN
  FOR _rec IN
    SELECT ca.id AS assignment_id, ca.channel_id, ca.conversation_phone,
           ch.organization_id
    FROM conversation_assignments ca
    JOIN channels ch ON ch.id = ca.channel_id
    WHERE ca.status != 'archived'
      AND NOT EXISTS (SELECT 1 FROM conversation_stats cs WHERE cs.assignment_id = ca.id)
    LIMIT batch_size
  LOOP
    INSERT INTO conversation_stats (
      assignment_id, channel_id, conversation_phone, organization_id,
      last_message_content, last_message_at, last_inbound_at,
      unread_count, sender_name
    )
    SELECT
      _rec.assignment_id, _rec.channel_id, _rec.conversation_phone, _rec.organization_id,
      lm.content, lm.created_at, li.created_at,
      COALESCE(uc.cnt, 0), li.sender_name
    FROM (SELECT 1) dummy
    LEFT JOIN LATERAL (
      SELECT wm.content, wm.created_at
      FROM whatsapp_messages wm
      WHERE wm.channel_id = _rec.channel_id
        AND wm.created_at > now() - interval '30 days'
        AND (
          (wm.direction = 'inbound' AND RIGHT(wm.sender_phone, 8) = RIGHT(_rec.conversation_phone, 8))
          OR (wm.direction = 'outbound' AND RIGHT(wm.metadata->>'destination', 8) = RIGHT(_rec.conversation_phone, 8))
        )
      ORDER BY wm.created_at DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT wm2.created_at, wm2.sender_name
      FROM whatsapp_messages wm2
      WHERE wm2.channel_id = _rec.channel_id
        AND wm2.direction = 'inbound'
        AND RIGHT(wm2.sender_phone, 8) = RIGHT(_rec.conversation_phone, 8)
        AND wm2.created_at > now() - interval '30 days'
      ORDER BY wm2.created_at DESC LIMIT 1
    ) li ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt
      FROM whatsapp_messages wm3
      WHERE wm3.channel_id = _rec.channel_id
        AND wm3.direction = 'inbound'
        AND wm3.is_read = false
        AND RIGHT(wm3.sender_phone, 8) = RIGHT(_rec.conversation_phone, 8)
        AND wm3.created_at > now() - interval '30 days'
    ) uc ON true
    ON CONFLICT (assignment_id) DO NOTHING;

    _processed := _processed + 1;
  END LOOP;

  RETURN _processed;
END;
$$;

-- ============================================================
-- 6. ADDITIONAL PERFORMANCE INDEXES
-- ============================================================
-- Composite index for message lookups by phone suffix (used heavily)
CREATE INDEX IF NOT EXISTS idx_wm_channel_direction_created
ON whatsapp_messages(channel_id, direction, created_at DESC);

-- Index for unread count queries
CREATE INDEX IF NOT EXISTS idx_wm_unread_inbound
ON whatsapp_messages(channel_id, sender_phone, created_at DESC)
WHERE direction = 'inbound' AND is_read = false;
