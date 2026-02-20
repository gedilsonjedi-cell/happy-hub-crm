
-- 1. Função para limpar registros antigos de status de mensagens (>15 dias)
-- No schema real, o status fica em whatsapp_messages. Limpamos mensagens
-- arquivadas antigas cujo status técnico já não é mais relevante.
CREATE OR REPLACE FUNCTION delete_old_whatsapp_status_logs()
RETURNS void AS $$
BEGIN
  -- Remove mensagens de conversas arquivadas com mais de 15 dias
  -- Mantém mensagens de conversas ativas intactas
  DELETE FROM whatsapp_messages wm
  WHERE wm.created_at < NOW() - INTERVAL '15 days'
    AND EXISTS (
      SELECT 1 FROM conversation_assignments ca
      WHERE ca.channel_id = wm.channel_id
        AND ca.status = 'archived'
        AND ca.updated_at < NOW() - INTERVAL '15 days'
        AND (
          wm.sender_phone LIKE '%' || RIGHT(ca.conversation_phone, 8)
          OR (wm.metadata->>'destination') LIKE '%' || RIGHT(ca.conversation_phone, 8)
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Índice composto para busca instantânea de mensagens por canal + telefone + data
-- Garante que a query de carregamento do chat nunca faça full table scan
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_channel_phone_date
  ON whatsapp_messages (channel_id, sender_phone, created_at DESC);

-- 3. Índice para busca de mensagens outbound por destination (metadata JSONB)
-- Usado na deleção de mensagens arquivadas e no carregamento de histórico
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_destination
  ON whatsapp_messages ((metadata->>'destination'), channel_id, created_at DESC)
  WHERE direction = 'outbound';

-- 4. Índice para conversation_assignments por phone + channel (busca por cliente)
-- Crítico para o meta-webhook: findOrCreateConversation usa esses campos
CREATE INDEX IF NOT EXISTS idx_conv_assignments_phone_channel
  ON conversation_assignments (conversation_phone, channel_id, status);

-- 5. Índice parcial para conversas ativas (excluindo arquivadas - conjunto menor)
CREATE INDEX IF NOT EXISTS idx_conv_assignments_active_updated
  ON conversation_assignments (channel_id, updated_at DESC)
  WHERE status != 'archived';
