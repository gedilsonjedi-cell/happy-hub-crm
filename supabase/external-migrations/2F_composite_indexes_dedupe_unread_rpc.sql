-- ============================================================================
-- FASE 2F — ÍNDICES COMPOSTOS, REMOÇÃO DE DUPLICADOS E RPC UNREAD OTIMIZADA
-- Continuação do 2E. Foco: reduzir as 10M+ chamadas que o pg_stat_statements
-- apontou como gargalo em whatsapp_messages e conversation_assignments,
-- e eliminar índices redundantes que estão penalizando os INSERT/UPDATE.
--
-- COLE NO SQL EDITOR DO SUPABASE EXTERNO E EXECUTE. Idempotente.
-- ============================================================================

-- ─── 1. Índices compostos solicitados ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_org_channel
  ON public.whatsapp_messages (organization_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_assignments_org_status
  ON public.conversation_assignments (organization_id, status);

-- ─── 2. Remover índices REDUNDANTES já conhecidos ──────────────────────────
-- Estes ficaram cobertos por índices compostos criados em 2A/2E/2F e só
-- penalizam a escrita. PK e UNIQUE são preservados.

-- conversation_assignments
DROP INDEX IF EXISTS public.idx_ca_org;             -- coberto por idx_ca_org_channel_active / idx_assignments_org_status
DROP INDEX IF EXISTS public.idx_ca_channel_status;  -- coberto por idx_ca_org_channel_active (parcial)

-- conversation_stats
DROP INDEX IF EXISTS public.idx_cs_org;             -- coberto por idx_cs_org_lastmsg
DROP INDEX IF EXISTS public.idx_cs_last_msg;        -- coberto por idx_cs_org_lastmsg

-- ─── 3. Remover índices DUPLICADOS exatos (whatsapp_messages, ─────────────
--      whatsapp_contacts, campaign_recipients) — dinâmico e seguro.
-- Mantém o índice com o menor OID (mais antigo) e dropa os demais que tenham
-- a MESMA tabela, MESMAS colunas (mesma ordem), MESMO predicate e que NÃO
-- sejam PK nem UNIQUE.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    WITH idx AS (
      SELECT
        n.nspname  AS schema_name,
        c.relname  AS table_name,
        ic.relname AS index_name,
        i.indexrelid,
        i.indisprimary,
        i.indisunique,
        pg_get_indexdef(i.indexrelid) AS def,
        -- chave canônica: tabela + colunas + predicate
        c.oid::text || '|' ||
          array_to_string(i.indkey::int[], ',') || '|' ||
          COALESCE(pg_get_expr(i.indpred, i.indrelid), '') AS sig
      FROM pg_index i
      JOIN pg_class  c  ON c.oid = i.indrelid
      JOIN pg_class  ic ON ic.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('whatsapp_messages', 'whatsapp_contacts', 'campaign_recipients')
    ),
    ranked AS (
      SELECT *,
        row_number() OVER (PARTITION BY sig ORDER BY indexrelid) AS rn,
        count(*)    OVER (PARTITION BY sig) AS dup_count
      FROM idx
      WHERE NOT indisprimary AND NOT indisunique
    )
    SELECT schema_name, table_name, index_name
    FROM ranked
    WHERE dup_count > 1 AND rn > 1
  LOOP
    RAISE NOTICE 'Dropping duplicate index %.%', r.schema_name, r.index_name;
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schema_name, r.index_name);
  END LOOP;
END $$;

-- ─── 4. RPC get_unread_conversations_full_ext — usa novos índices ─────────
-- Filtra por organization_id (covered por idx_assignments_org_status) e
-- unread_count > 0 (covered por idx_cs_org_unread parcial). Sem Seq Scan.
CREATE OR REPLACE FUNCTION public.get_unread_conversations_full_ext(
  p_channel_ids uuid[],
  p_organization_id uuid
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
  SELECT
    ca.id, ca.conversation_phone, ca.channel_id, ca.assigned_to, ca.status,
    ca.sector_id, ca.lead_id, ca.updated_at, ca.is_bot_handling,
    ca.campaign_chatbot_id, ca.bot_paused_until,
    cs.last_message_content, cs.last_message_at, cs.last_inbound_at,
    COALESCE(cs.unread_count, 0), cs.sender_name
  FROM public.conversation_stats cs
  JOIN public.conversation_assignments ca ON ca.id = cs.assignment_id
  WHERE cs.organization_id = p_organization_id
    AND cs.unread_count > 0                       -- idx_cs_org_unread (parcial)
    AND ca.status <> 'archived'                   -- idx_ca_org_channel_active
    AND ca.channel_id = ANY(p_channel_ids)
    AND ca.organization_id::text = (auth.jwt()->>'organization_id')
  ORDER BY cs.last_message_at DESC NULLS LAST
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_conversations_full_ext(uuid[], uuid)
  TO authenticated, service_role;

-- ─── 5. ANALYZE para o planner usar os novos índices imediatamente ────────
ANALYZE public.whatsapp_messages;
ANALYZE public.whatsapp_contacts;
ANALYZE public.campaign_recipients;
ANALYZE public.conversation_assignments;
ANALYZE public.conversation_stats;

-- ─── 6. Verificação (rode depois) ──────────────────────────────────────────
-- Lista índices restantes por tabela:
-- SELECT tablename, indexname, indexdef FROM pg_indexes
--  WHERE schemaname='public'
--    AND tablename IN ('whatsapp_messages','whatsapp_contacts','campaign_recipients',
--                      'conversation_assignments','conversation_stats')
--  ORDER BY tablename, indexname;
--
-- Confirma plano da RPC:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM public.get_unread_conversations_full_ext(
--   ARRAY['<channel_id>']::uuid[], '<org_id>'::uuid
-- );
-- Esperado: Index Scan em idx_cs_org_unread + idx_ca_org_channel_active.
