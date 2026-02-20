
-- Corrigir conversas fantasma: reverter para 'archived' as conversations_assignments
-- criadas como 'pending' mas que não têm nenhuma mensagem inbound real
-- Estas foram criadas pelo bug do meta-webhook ao processar eventos de delivery

UPDATE conversation_assignments ca
SET 
  status = 'archived',
  updated_at = NOW()
WHERE ca.status = 'pending'
  AND ca.updated_at >= NOW() - INTERVAL '6 hours'
  AND ca.assigned_to IS NULL
  -- Só reverter se não há mensagem inbound real associada
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_messages wm
    WHERE wm.direction = 'inbound'
      AND wm.channel_id = ca.channel_id
      AND wm.sender_phone LIKE '%' || RIGHT(ca.conversation_phone, 8)
  )
  -- Só reverter se há mensagem outbound (disparo) que confirma que é lead de campanha
  AND EXISTS (
    SELECT 1 FROM whatsapp_messages wm
    WHERE wm.direction = 'outbound'
      AND wm.channel_id = ca.channel_id
      AND (wm.metadata->>'destination') LIKE '%' || RIGHT(ca.conversation_phone, 8)
  );
