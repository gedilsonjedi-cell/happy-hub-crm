-- 2H — Restaura whatsapp_messages na publicação realtime do banco EXTERNO
--
-- Contexto: a migração 2E removeu public.whatsapp_messages da publicação
-- `supabase_realtime` para aliviar o pool de conexões realtime. Consequência:
-- o canal `ext-msgs-*` do frontend (useChatRealtime) nunca mais recebeu
-- eventos, e as mensagens novas só apareciam pelo polling de 8s — daí a
-- percepção de "demora muito" / "não aparece".
--
-- Impacto de custo: a subscription do frontend escuta apenas INSERT, e a
-- REPLICA IDENTITY permanece DEFAULT (só a PK é replicada em UPDATE/DELETE),
-- então o overhead de WAL/logical replication é bem menor do que era antes
-- da 2E (que também revertia REPLICA IDENTITY FULL). Seguro de reaplicar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;

-- Mantém a replica identity enxuta (apenas PK) — suficiente para INSERT.
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY DEFAULT;

-- ─── VERIFICAÇÃO (rode após a migração) ────────────────────────────────────
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
-- Esperado conter: conversation_assignments, conversation_stats,
-- whatsapp_messages.
