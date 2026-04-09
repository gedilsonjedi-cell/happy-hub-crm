
CREATE OR REPLACE FUNCTION public.delete_organization_cascade(_organization_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _channel_ids uuid[];
BEGIN
  -- Collect channel IDs upfront
  SELECT array_agg(id) INTO _channel_ids FROM channels WHERE organization_id = _organization_id;

  -- Delete whatsapp_messages (heaviest table) for org channels
  IF _channel_ids IS NOT NULL THEN
    DELETE FROM whatsapp_messages WHERE channel_id = ANY(_channel_ids);
    DELETE FROM conversation_metrics WHERE channel_id = ANY(_channel_ids);
    DELETE FROM conversation_assignments WHERE channel_id = ANY(_channel_ids);
    DELETE FROM conversation_notes WHERE channel_id = ANY(_channel_ids);
    DELETE FROM conversation_memory WHERE channel_id = ANY(_channel_ids);
  END IF;

  -- Delete flow bot data
  DELETE FROM flow_sessions WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM flow_edges WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM flow_nodes WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM flow_bots WHERE organization_id = _organization_id;

  -- Delete lead activity log
  DELETE FROM lead_activity_log WHERE lead_id IN (SELECT id FROM leads WHERE organization_id = _organization_id);

  -- Delete redirect links
  DELETE FROM redirect_links WHERE organization_id = _organization_id;

  -- Deletar transações de saldo
  DELETE FROM balance_transactions WHERE organization_id = _organization_id;
  DELETE FROM organization_balance WHERE organization_id = _organization_id;
  DELETE FROM organization_addons WHERE organization_id = _organization_id;
  DELETE FROM store_purchases WHERE organization_id = _organization_id;
  DELETE FROM pix_payments WHERE organization_id = _organization_id;
  DELETE FROM referral_codes WHERE organization_id = _organization_id;
  DELETE FROM referrals WHERE referrer_organization_id = _organization_id OR referred_organization_id = _organization_id;
  DELETE FROM auto_recharge_config WHERE organization_id = _organization_id;
  DELETE FROM scheduled_messages WHERE organization_id = _organization_id;

  -- Follow-ups
  DELETE FROM follow_up_logs WHERE instance_id IN (SELECT id FROM follow_up_instances WHERE organization_id = _organization_id);
  DELETE FROM follow_up_instances WHERE organization_id = _organization_id;
  DELETE FROM follow_up_messages WHERE sequence_id IN (SELECT id FROM follow_up_sequences WHERE organization_id = _organization_id);
  DELETE FROM follow_up_sequences WHERE organization_id = _organization_id;

  -- Conversation data already deleted above via channel_ids, clean remaining by org_id
  DELETE FROM conversation_notes WHERE organization_id = _organization_id;
  DELETE FROM conversation_memory WHERE organization_id = _organization_id;

  -- Campaigns
  DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE organization_id = _organization_id);
  DELETE FROM campaign_channels WHERE campaign_id IN (SELECT id FROM campaigns WHERE organization_id = _organization_id);
  DELETE FROM campaigns WHERE organization_id = _organization_id;
  DELETE FROM dispatch_costs WHERE organization_id = _organization_id;
  DELETE FROM hygiene_history WHERE organization_id = _organization_id;
  DELETE FROM blacklist WHERE organization_id = _organization_id;
  DELETE FROM holidays WHERE organization_id = _organization_id;
  DELETE FROM business_hours WHERE organization_id = _organization_id;
  DELETE FROM away_message_config WHERE organization_id = _organization_id;
  DELETE FROM chatbot_config WHERE organization_id = _organization_id;

  -- AI agents & knowledge
  DELETE FROM knowledge_documents WHERE agent_id IN (SELECT id FROM ai_agents WHERE organization_id = _organization_id);
  DELETE FROM ai_agents WHERE organization_id = _organization_id;

  -- Channels & templates
  DELETE FROM channel_templates WHERE channel_id = ANY(COALESCE(_channel_ids, ARRAY[]::uuid[]));
  DELETE FROM channels WHERE organization_id = _organization_id;
  DELETE FROM message_templates WHERE organization_id = _organization_id;
  DELETE FROM quick_responses WHERE organization_id = _organization_id;

  -- Leads & related
  DELETE FROM client_portfolios WHERE organization_id = _organization_id;
  DELETE FROM leads WHERE organization_id = _organization_id;
  DELETE FROM lead_tags WHERE organization_id = _organization_id;
  DELETE FROM lead_custom_field_definitions WHERE organization_id = _organization_id;

  -- Pipeline
  DELETE FROM pipeline_stages WHERE organization_id = _organization_id;
  DELETE FROM pipelines WHERE organization_id = _organization_id;

  -- Users & roles
  DELETE FROM attendant_availability WHERE organization_id = _organization_id;
  DELETE FROM sectors WHERE organization_id = _organization_id;
  DELETE FROM user_sectors WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  DELETE FROM user_roles WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  DELETE FROM user_sessions WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  DELETE FROM profiles WHERE organization_id = _organization_id;

  -- Finally delete org
  DELETE FROM organizations WHERE id = _organization_id;

  RETURN TRUE;
END;
$function$;
