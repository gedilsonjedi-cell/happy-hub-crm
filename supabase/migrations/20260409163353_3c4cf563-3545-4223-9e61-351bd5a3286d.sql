-- 1. Índice em leads.phone (busca mais crítica do sistema - matching por telefone)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);

-- 2. Índice em conversation_assignments.lead_id (joins frequentes)
CREATE INDEX IF NOT EXISTS idx_conv_assignments_lead_id ON public.conversation_assignments(lead_id) WHERE lead_id IS NOT NULL;

-- 3. Índice em balance_transactions por org + data (consultas de saldo)
CREATE INDEX IF NOT EXISTS idx_balance_transactions_org_date ON public.balance_transactions(organization_id, created_at DESC);

-- 4. VACUUM das tabelas com mais dead tuples para liberar espaço
-- (executado automaticamente pelo autovacuum, mas forçamos para efeito imediato)

-- 5. Limpar conversation_memory expirada (dados de bot sem valor)
DELETE FROM public.conversation_memory WHERE expires_at < now();

-- 6. Limpar flow_sessions inativas há mais de 7 dias
DELETE FROM public.flow_sessions WHERE updated_at < now() - interval '7 days';

-- 7. Limpar lead_activity_log com mais de 90 dias
DELETE FROM public.lead_activity_log WHERE created_at < now() - interval '90 days';