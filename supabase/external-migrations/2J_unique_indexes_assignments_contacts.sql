-- 2J — Índices únicos que impedem fisicamente conversas/contatos duplicados
-- RODAR NO SQL EDITOR DO BANCO EXTERNO (SSoT).
--
-- Contexto (investigação 28/08/2026 — RZ Financeira):
--  1. whatsapp_contacts não tem índice único em (channel_id, sender_phone):
--     todo upsert do meta-webhook/meta-send falhava com 42P10
--     ("there is no unique or exclusion constraint matching the ON CONFLICT
--     specification") — por isso a tabela está VAZIA.
--  2. conversation_assignments só tem UNIQUE (conversation_phone, channel_id).
--     Como o mesmo cliente aparece com e sem o 9º dígito, nasciam DUAS linhas
--     para a mesma conversa: a nova sem dono, e o atendimento "sumia" do operador.
--     O índice funcional abaixo trata as duas variantes como a MESMA conversa.

-- =====================================================================
-- 1) whatsapp_contacts — dedupe defensivo + índice único
-- =====================================================================
DELETE FROM public.whatsapp_contacts a
USING public.whatsapp_contacts b
WHERE a.ctid < b.ctid
  AND a.channel_id IS NOT DISTINCT FROM b.channel_id
  AND a.sender_phone = b.sender_phone;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_contacts_channel_phone
  ON public.whatsapp_contacts (channel_id, sender_phone);

-- =====================================================================
-- 2) conversation_assignments — relatório de duplicatas restantes
--    (a RZ Financeira já foi deduplicada; rode para ver as outras orgs)
-- =====================================================================
-- SELECT organization_id,
--        channel_id,
--        right(regexp_replace(conversation_phone, '\D', '', 'g'), 8) AS sufixo,
--        count(*), array_agg(id)
--   FROM public.conversation_assignments
--  WHERE channel_id IS NOT NULL
--  GROUP BY 1,2,3
-- HAVING count(*) > 1
--  ORDER BY count(*) DESC;

-- 2b) Dedupe global por (channel_id, sufixo 8): mantém a linha com dono
--     (preferindo in_progress) e mais recente; reaponta/mescla as stats
--     e apaga as perdedoras. whatsapp_messages referencia por TELEFONE,
--     não por assignment_id, então nenhum histórico é perdido.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY channel_id, right(regexp_replace(conversation_phone, '\D', '', 'g'), 8)
           ORDER BY (assigned_to IS NOT NULL) DESC,
                    (status = 'in_progress') DESC,
                    updated_at DESC
         ) AS winner_id
    FROM public.conversation_assignments
   WHERE channel_id IS NOT NULL
),
losers AS (
  SELECT id, winner_id FROM ranked WHERE id <> winner_id
),
-- stats da perdedora vão para a vencedora quando esta ainda não tem stats
moved AS (
  UPDATE public.conversation_stats cs
     SET assignment_id = l.winner_id,
         updated_at = now()
    FROM losers l
   WHERE cs.assignment_id = l.id
     AND NOT EXISTS (SELECT 1 FROM public.conversation_stats w WHERE w.assignment_id = l.winner_id)
  RETURNING cs.id
),
-- as demais (colisão com stats já existentes na vencedora) são descartadas
dropped AS (
  DELETE FROM public.conversation_stats cs
   USING losers l
   WHERE cs.assignment_id = l.id
     AND cs.id NOT IN (SELECT id FROM moved)
  RETURNING cs.id
)
DELETE FROM public.conversation_assignments ca
 USING losers l
 WHERE ca.id = l.id;

-- =====================================================================
-- 3) Índice único funcional: uma conversa por (canal, sufixo de 8 dígitos)
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_assignments_channel_phone8
  ON public.conversation_assignments (
    channel_id,
    right(regexp_replace(conversation_phone, '\D', '', 'g'), 8)
  )
  WHERE channel_id IS NOT NULL;
