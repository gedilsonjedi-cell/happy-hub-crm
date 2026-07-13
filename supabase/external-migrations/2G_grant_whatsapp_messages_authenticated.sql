-- ─────────────────────────────────────────────────────────────────────────
-- 2G_grant_whatsapp_messages_authenticated.sql
--
-- HOTFIX crítico (2026-07-13):
-- Clientes estavam vendo "Sem histórico disponível para esta conversa" em
-- conversas que possuem mensagens no banco externo. Causa raiz:
--
--   role `authenticated` NÃO tinha `SELECT` nas tabelas `whatsapp_messages`
--   e `whatsapp_contacts` do banco externo.
--
-- Efeito: toda leitura direta caía com "permission denied for table
-- whatsapp_messages", o front acionava o circuit-breaker e joga tudo no
-- edge function `external-db-proxy`. O proxy ficava saturado (avg 1.9s,
-- picos de 57s, requests estourando o timeout do cliente) e retornava
-- vazio, gerando o falso "Sem histórico".
--
-- Este script libera as leituras diretas para usuários autenticados,
-- respeitando as políticas de RLS já existentes (RLS filtra por
-- organization_id via claim JWT).
--
-- Execute no SQL Editor do projeto Supabase EXTERNO
-- (vytjufibiwhtvsnvvqri) com role owner.
-- ─────────────────────────────────────────────────────────────────────────

-- Leitura direta (SELECT) para o front autenticado.
GRANT SELECT ON public.whatsapp_messages  TO authenticated;
GRANT SELECT ON public.whatsapp_contacts  TO authenticated;

-- Service role continua com acesso total (usado por edge functions).
GRANT ALL ON public.whatsapp_messages  TO service_role;
GRANT ALL ON public.whatsapp_contacts  TO service_role;

-- Confirma que as políticas RLS existem e continuam ativas.
ALTER TABLE public.whatsapp_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts  ENABLE ROW LEVEL SECURITY;

-- Verificação (opcional; remove se rodar em transaction only)
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema='public'
--    AND table_name IN ('whatsapp_messages','whatsapp_contacts')
--  ORDER BY table_name, grantee;
