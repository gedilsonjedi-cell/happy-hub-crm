-- Função para excluir organização e todos dados relacionados
CREATE OR REPLACE FUNCTION public.delete_organization_cascade(_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deletar transações de saldo
  DELETE FROM balance_transactions WHERE organization_id = _organization_id;
  
  -- Deletar saldo da organização
  DELETE FROM organization_balance WHERE organization_id = _organization_id;
  
  -- Deletar addons
  DELETE FROM organization_addons WHERE organization_id = _organization_id;
  
  -- Deletar compras
  DELETE FROM store_purchases WHERE organization_id = _organization_id;
  
  -- Deletar pagamentos PIX
  DELETE FROM pix_payments WHERE organization_id = _organization_id;
  
  -- Deletar referral codes
  DELETE FROM referral_codes WHERE organization_id = _organization_id;
  
  -- Deletar referrals (como referrer ou referred)
  DELETE FROM referrals WHERE referrer_organization_id = _organization_id OR referred_organization_id = _organization_id;
  
  -- Deletar configuração de recarga automática
  DELETE FROM auto_recharge_config WHERE organization_id = _organization_id;
  
  -- Deletar mensagens agendadas
  DELETE FROM scheduled_messages WHERE organization_id = _organization_id;
  
  -- Deletar follow-up instances (precisa deletar logs primeiro)
  DELETE FROM follow_up_logs WHERE instance_id IN (
    SELECT id FROM follow_up_instances WHERE organization_id = _organization_id
  );
  DELETE FROM follow_up_instances WHERE organization_id = _organization_id;
  
  -- Deletar follow-up messages e sequences
  DELETE FROM follow_up_messages WHERE sequence_id IN (
    SELECT id FROM follow_up_sequences WHERE organization_id = _organization_id
  );
  DELETE FROM follow_up_sequences WHERE organization_id = _organization_id;
  
  -- Deletar notas de conversa
  DELETE FROM conversation_notes WHERE organization_id = _organization_id;
  
  -- Deletar memória de conversa
  DELETE FROM conversation_memory WHERE organization_id = _organization_id;
  
  -- Deletar assignments de conversa
  DELETE FROM conversation_assignments WHERE channel_id IN (
    SELECT id FROM channels WHERE organization_id = _organization_id
  );
  
  -- Deletar campaign recipients e channels
  DELETE FROM campaign_recipients WHERE campaign_id IN (
    SELECT id FROM campaigns WHERE organization_id = _organization_id
  );
  DELETE FROM campaign_channels WHERE campaign_id IN (
    SELECT id FROM campaigns WHERE organization_id = _organization_id
  );
  DELETE FROM campaigns WHERE organization_id = _organization_id;
  
  -- Deletar dispatch costs
  DELETE FROM dispatch_costs WHERE organization_id = _organization_id;
  
  -- Deletar hygiene history
  DELETE FROM hygiene_history WHERE organization_id = _organization_id;
  
  -- Deletar blacklist
  DELETE FROM blacklist WHERE organization_id = _organization_id;
  
  -- Deletar holidays
  DELETE FROM holidays WHERE organization_id = _organization_id;
  
  -- Deletar business hours
  DELETE FROM business_hours WHERE organization_id = _organization_id;
  
  -- Deletar away message config
  DELETE FROM away_message_config WHERE organization_id = _organization_id;
  
  -- Deletar chatbot config
  DELETE FROM chatbot_config WHERE organization_id = _organization_id;
  
  -- Deletar documentos de conhecimento dos agentes
  DELETE FROM knowledge_documents WHERE agent_id IN (
    SELECT id FROM ai_agents WHERE organization_id = _organization_id
  );
  
  -- Deletar agentes IA
  DELETE FROM ai_agents WHERE organization_id = _organization_id;
  
  -- Deletar channel templates
  DELETE FROM channel_templates WHERE channel_id IN (
    SELECT id FROM channels WHERE organization_id = _organization_id
  );
  
  -- Deletar canais
  DELETE FROM channels WHERE organization_id = _organization_id;
  
  -- Deletar templates de mensagem
  DELETE FROM message_templates WHERE organization_id = _organization_id;
  
  -- Deletar quick responses
  DELETE FROM quick_responses WHERE organization_id = _organization_id;
  
  -- Deletar client portfolios
  DELETE FROM client_portfolios WHERE organization_id = _organization_id;
  
  -- Deletar leads
  DELETE FROM leads WHERE organization_id = _organization_id;
  
  -- Deletar lead tags
  DELETE FROM lead_tags WHERE organization_id = _organization_id;
  
  -- Deletar custom field definitions
  DELETE FROM lead_custom_field_definitions WHERE organization_id = _organization_id;
  
  -- Deletar pipeline stages
  DELETE FROM pipeline_stages WHERE organization_id = _organization_id;
  
  -- Deletar pipelines
  DELETE FROM pipelines WHERE organization_id = _organization_id;
  
  -- Deletar attendant availability
  DELETE FROM attendant_availability WHERE organization_id = _organization_id;
  
  -- Deletar setores
  DELETE FROM sectors WHERE organization_id = _organization_id;
  
  -- Deletar user_sectors para usuários da organização
  DELETE FROM user_sectors WHERE user_id IN (
    SELECT user_id FROM profiles WHERE organization_id = _organization_id
  );
  
  -- Deletar user_roles para usuários da organização
  DELETE FROM user_roles WHERE user_id IN (
    SELECT user_id FROM profiles WHERE organization_id = _organization_id
  );
  
  -- Deletar user_sessions para usuários da organização
  DELETE FROM user_sessions WHERE user_id IN (
    SELECT user_id FROM profiles WHERE organization_id = _organization_id
  );
  
  -- Deletar profiles
  DELETE FROM profiles WHERE organization_id = _organization_id;
  
  -- Finalmente, deletar a organização
  DELETE FROM organizations WHERE id = _organization_id;
  
  RETURN TRUE;
END;
$$;