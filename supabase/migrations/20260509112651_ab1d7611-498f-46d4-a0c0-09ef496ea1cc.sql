-- 1) whatsapp_messages: tabela já migrada para o banco externo (SSoT).
-- Está com 0 linhas mas 210MB de índices inchados. TRUNCATE + REINDEX limpa tudo.
TRUNCATE TABLE public.whatsapp_messages;
REINDEX TABLE public.whatsapp_messages;

-- 2) conversation_assignments: remove arquivados antigos (> 60 dias)
DELETE FROM public.conversation_assignments
WHERE status = 'archived'
  AND updated_at < now() - interval '60 days';

-- 3) conversation_stats: remove órfãos (assignment não existe mais)
DELETE FROM public.conversation_stats cs
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversation_assignments ca WHERE ca.id = cs.assignment_id
);

-- 4) Reindex das tabelas que sofreram delete pesado para devolver espaço
REINDEX TABLE public.conversation_assignments;
REINDEX TABLE public.conversation_stats;