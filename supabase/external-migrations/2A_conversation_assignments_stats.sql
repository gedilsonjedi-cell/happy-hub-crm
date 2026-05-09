-- ============================================================================
-- FASE 2A — Schema espelho no banco EXTERNO
-- Cria conversation_assignments e conversation_stats com RLS por organization_id
-- COLE ISSO NO SQL EDITOR DO DASHBOARD DO SUPABASE EXTERNO E EXECUTE.
-- Idempotente: pode rodar múltiplas vezes sem quebrar.
-- ============================================================================

-- ─── conversation_assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  channel_id uuid,
  conversation_phone text NOT NULL,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'pending',
  sector_id uuid,
  lead_id uuid,
  is_bot_handling boolean DEFAULT false,
  campaign_chatbot_id uuid,
  bot_paused_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_org ON public.conversation_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_ca_channel_status ON public.conversation_assignments(channel_id, status);
CREATE INDEX IF NOT EXISTS idx_ca_assigned ON public.conversation_assignments(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_phone_suffix ON public.conversation_assignments(right(conversation_phone, 8));
CREATE UNIQUE INDEX IF NOT EXISTS uq_ca_channel_phone ON public.conversation_assignments(channel_id, conversation_phone) WHERE channel_id IS NOT NULL;

ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_select" ON public.conversation_assignments;
CREATE POLICY "org_isolation_select" ON public.conversation_assignments
  FOR SELECT USING (organization_id::text = (auth.jwt()->>'organization_id'));

DROP POLICY IF EXISTS "org_isolation_all" ON public.conversation_assignments;
CREATE POLICY "org_isolation_all" ON public.conversation_assignments
  FOR ALL USING (organization_id::text = (auth.jwt()->>'organization_id'))
  WITH CHECK (organization_id::text = (auth.jwt()->>'organization_id'));

-- ─── conversation_stats ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE,
  channel_id uuid,
  conversation_phone text NOT NULL,
  organization_id uuid NOT NULL,
  last_message_content text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  sender_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_org ON public.conversation_stats(organization_id);
CREATE INDEX IF NOT EXISTS idx_cs_channel_phone ON public.conversation_stats(channel_id, conversation_phone);
CREATE INDEX IF NOT EXISTS idx_cs_last_msg ON public.conversation_stats(last_message_at DESC NULLS LAST);

ALTER TABLE public.conversation_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_select" ON public.conversation_stats;
CREATE POLICY "org_isolation_select" ON public.conversation_stats
  FOR SELECT USING (organization_id::text = (auth.jwt()->>'organization_id'));

DROP POLICY IF EXISTS "org_isolation_all" ON public.conversation_stats;
CREATE POLICY "org_isolation_all" ON public.conversation_stats
  FOR ALL USING (organization_id::text = (auth.jwt()->>'organization_id'))
  WITH CHECK (organization_id::text = (auth.jwt()->>'organization_id'));

-- ─── RPC: upsert stats (chamada pelo meta-webhook) ──────────────────────────
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
  _phone_suffix text := right(regexp_replace(_conversation_phone, '\D', '', 'g'), 8);
BEGIN
  IF _phone_suffix = '' THEN RETURN NULL; END IF;

  -- Try to find existing assignment
  SELECT id INTO _assignment_id
  FROM conversation_assignments
  WHERE organization_id = _organization_id
    AND channel_id = _channel_id
    AND status != 'archived'
    AND right(conversation_phone, 8) = _phone_suffix
  LIMIT 1;

  -- Auto-create assignment for inbound messages without existing one
  IF _assignment_id IS NULL AND _direction = 'inbound' THEN
    INSERT INTO conversation_assignments (organization_id, channel_id, conversation_phone, status)
    VALUES (_organization_id, _channel_id, _conversation_phone, 'pending')
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

-- ─── RPC: leitura paginada (substitui get_conversations_summary interna) ───
CREATE OR REPLACE FUNCTION public.get_conversations_summary_ext(
  p_channel_ids uuid[],
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
) RETURNS TABLE(
  assignment_id uuid, conversation_phone text, channel_id uuid,
  assigned_to uuid, status text, sector_id uuid, lead_id uuid,
  assignment_updated_at timestamptz, is_bot_handling boolean,
  campaign_chatbot_id uuid, bot_paused_until timestamptz,
  last_message_content text, last_message_at timestamptz,
  last_inbound_at timestamptz, unread_count int, sender_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ca.id, ca.conversation_phone, ca.channel_id, ca.assigned_to, ca.status,
    ca.sector_id, ca.lead_id, ca.updated_at, ca.is_bot_handling,
    ca.campaign_chatbot_id, ca.bot_paused_until,
    cs.last_message_content, cs.last_message_at, cs.last_inbound_at,
    COALESCE(cs.unread_count, 0), cs.sender_name
  FROM conversation_assignments ca
  LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
  WHERE ca.channel_id = ANY(p_channel_ids)
    AND ca.status != 'archived'
    AND ca.organization_id::text = (auth.jwt()->>'organization_id')
  ORDER BY cs.last_message_at DESC NULLS LAST, ca.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── RPC: archive / restore / reset_unread ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_conversation_ext(p_channel_id uuid, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversation_assignments
  SET status = 'archived', updated_at = now()
  WHERE channel_id = p_channel_id
    AND right(conversation_phone, 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
    AND organization_id::text = (auth.jwt()->>'organization_id');
END; $$;

CREATE OR REPLACE FUNCTION public.restore_conversation_ext(p_channel_id uuid, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversation_assignments
  SET status = 'in_progress', updated_at = now()
  WHERE channel_id = p_channel_id
    AND right(conversation_phone, 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
    AND organization_id::text = (auth.jwt()->>'organization_id');
END; $$;

CREATE OR REPLACE FUNCTION public.reset_conversation_unread_ext(p_channel_id uuid, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversation_stats
  SET unread_count = 0, updated_at = now()
  WHERE channel_id = p_channel_id
    AND right(conversation_phone, 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
    AND organization_id::text = (auth.jwt()->>'organization_id');
END; $$;

-- ─── Realtime publication ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_assignments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_assignments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='conversation_stats') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_stats;
  END IF;
END $$;

ALTER TABLE public.conversation_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_stats REPLICA IDENTITY FULL;

-- Pronto. Próximo passo: rodar Fase 2A backfill via edge function migrate-assignments-to-external.
