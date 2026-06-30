-- ============================================================================
-- FASE 2E — OTIMIZAÇÃO DE PERFORMANCE NO BANCO EXTERNO
-- Objetivo: derrubar CPU/Memória do Postgres externo criando índices que
-- cobrem os filtros mais usados (organization_id, channel_id, status,
-- timestamps) e garantindo que a RPC paginada do sidebar use index scan
-- estrito (sem Seq Scan).
--
-- COLE ESSE SQL NO SQL EDITOR DO SUPABASE EXTERNO E EXECUTE.
-- Tudo é idempotente — pode rodar várias vezes sem efeito colateral.
-- IMPORTANTE: use o SQL Editor (statements separados). NÃO envolver em
-- transação única se quiser usar CONCURRENTLY; por padrão deixei sem
-- CONCURRENTLY para funcionar dentro de uma migração transacional.
-- ============================================================================

-- ─── 1. ÍNDICES — conversation_assignments ─────────────────────────────────
-- A RPC paginada filtra por: channel_id IN (...) AND status != 'archived'
-- AND organization_id = auth.jwt(). Index parcial cobre todas as buscas
-- "ativas" sem carregar as arquivadas (que tendem a dominar o volume).
CREATE INDEX IF NOT EXISTS idx_ca_org_channel_active
  ON public.conversation_assignments (organization_id, channel_id, updated_at DESC)
  WHERE status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_ca_org_assigned_active
  ON public.conversation_assignments (organization_id, assigned_to, updated_at DESC)
  WHERE status <> 'archived' AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ca_org_updated
  ON public.conversation_assignments (organization_id, updated_at DESC);

-- ─── 2. ÍNDICES — conversation_stats ───────────────────────────────────────
-- O ORDER BY do sidebar é cs.last_message_at DESC. Index composto + parcial
-- evita o Seq Scan dominante quando há centenas de milhares de stats.
CREATE INDEX IF NOT EXISTS idx_cs_org_lastmsg
  ON public.conversation_stats (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cs_org_unread
  ON public.conversation_stats (organization_id, unread_count)
  WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_cs_assignment
  ON public.conversation_stats (assignment_id);

-- ─── 3. ÍNDICES — whatsapp_messages ────────────────────────────────────────
-- Consultas frequentes: por channel_id+phone+created_at (histórico de chat),
-- por organization_id+created_at (relatórios e heatmap), por direction
-- (filtros inbound/outbound). Index parcial para inbound recente reduz
-- imensamente o custo do scan no relatório de tráfego.
CREATE INDEX IF NOT EXISTS idx_wm_channel_phone_created
  ON public.whatsapp_messages (channel_id, conversation_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_org_created
  ON public.whatsapp_messages (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_channel_created
  ON public.whatsapp_messages (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_org_direction_created
  ON public.whatsapp_messages (organization_id, direction, created_at DESC);

-- Histórico do chat normalmente busca pelos últimos 8 dígitos do telefone.
CREATE INDEX IF NOT EXISTS idx_wm_channel_phone_suffix
  ON public.whatsapp_messages (channel_id, right(conversation_phone, 8), created_at DESC);

-- ─── 4. RPC PAGINADA — index scan estrito (sem Seq Scan) ───────────────────
-- Substitui a versão antiga: o predicate agora usa colunas indexadas
-- (channel_id ANY + status parcial + organization_id), ordena por
-- last_message_at DESC (coberto por idx_cs_org_lastmsg) e força LIMIT/OFFSET
-- pequenos. SECURITY DEFINER + RLS via auth.jwt().
CREATE OR REPLACE FUNCTION public.get_conversations_summary_paginated_ext(
  p_channel_ids uuid[],
  p_organization_id uuid,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS TABLE(
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
  sender_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT
      ca.id, ca.conversation_phone, ca.channel_id, ca.assigned_to, ca.status,
      ca.sector_id, ca.lead_id, ca.updated_at, ca.is_bot_handling,
      ca.campaign_chatbot_id, ca.bot_paused_until,
      cs.last_message_content, cs.last_message_at, cs.last_inbound_at,
      COALESCE(cs.unread_count, 0) AS unread_count, cs.sender_name
    FROM conversation_assignments ca
    LEFT JOIN conversation_stats cs ON cs.assignment_id = ca.id
    WHERE ca.organization_id = p_organization_id
      AND ca.status <> 'archived'
      AND ca.channel_id = ANY(p_channel_ids)
      AND ca.organization_id::text = (auth.jwt()->>'organization_id')
    ORDER BY cs.last_message_at DESC NULLS LAST, ca.updated_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT * FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversations_summary_paginated_ext(uuid[], uuid, int, int)
  TO authenticated, service_role;

-- ─── 5. ANALYZE para o planner enxergar as novas estatísticas ──────────────
ANALYZE public.conversation_assignments;
ANALYZE public.conversation_stats;
ANALYZE public.whatsapp_messages;

-- ─── 6. REALTIME — reduzir overhead do logical replication ─────────────────
-- REPLICA IDENTITY FULL replica TODAS as colunas em cada UPDATE — gera
-- pressão de I/O e WAL desnecessária. Voltamos para DEFAULT (apenas PK),
-- que é suficiente para os listeners do frontend (eles re-fetcham por id).
ALTER TABLE public.conversation_assignments REPLICA IDENTITY DEFAULT;
ALTER TABLE public.conversation_stats       REPLICA IDENTITY DEFAULT;

-- whatsapp_messages NÃO deveria estar publicada (frontend lê via REST/RPC).
-- Se estiver, remova para aliviar o pool de conexões realtime:
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.whatsapp_messages;
  END IF;
END $$;

-- ─── 7. VERIFICAÇÃO — rode após a migração para confirmar index scan ──────
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM public.get_conversations_summary_paginated_ext(
--   ARRAY['<channel_id>']::uuid[], '<org_id>'::uuid, 50, 0
-- );
-- Esperado: "Index Scan using idx_ca_org_channel_active" e
-- "Index Scan using idx_cs_assignment".
