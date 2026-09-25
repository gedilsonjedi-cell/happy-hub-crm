CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor','super_admin'))
$$;
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS varchar LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))::varchar
$$;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS auto_blacklist_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS decline_message_enabled boolean NOT NULL DEFAULT false;
DELETE FROM public.user_sessions a USING public.user_sessions b WHERE a.user_id = b.user_id AND a.id <> b.id AND (a.last_active_at < b.last_active_at OR (a.last_active_at = b.last_active_at AND a.id < b.id));
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_user_id_key ON public.user_sessions(user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'))
$$;

CREATE OR REPLACE FUNCTION public.claim_campaign_recipients(p_campaign_id uuid, p_batch_size integer, p_include_retries boolean DEFAULT true)
RETURNS TABLE(id uuid, phone text, name text, status text, retry_count integer, last_error_code text, is_retry boolean, lead_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id
      AND (c.status = 'running' OR (p_include_retries AND c.status = 'completed')) FOR UPDATE) THEN
    RETURN;
  END IF;
  IF p_include_retries THEN
    RETURN QUERY
    WITH retries AS (
      SELECT cr.id FROM public.campaign_recipients cr
      WHERE cr.campaign_id = p_campaign_id AND cr.status = 'waiting_retry' AND cr.next_retry_at <= now()
      ORDER BY cr.next_retry_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED)
    UPDATE public.campaign_recipients cr SET status = 'processing', updated_at = now()
    FROM retries WHERE cr.id = retries.id
    RETURNING cr.id, cr.phone, cr.name, 'waiting_retry'::text, cr.retry_count, cr.last_error_code, true, cr.lead_id;
  END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT cr.id FROM public.campaign_recipients cr
    WHERE cr.campaign_id = p_campaign_id AND cr.status = 'pending'
    ORDER BY cr.created_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED)
  UPDATE public.campaign_recipients cr SET status = 'processing', updated_at = now()
  FROM claimed WHERE cr.id = claimed.id
  RETURNING cr.id, cr.phone, cr.name, 'pending'::text, cr.retry_count, cr.last_error_code, false, cr.lead_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.debit_organization_balance(_organization_id uuid, _amount numeric, _description text DEFAULT NULL, _reference_type text DEFAULT NULL, _reference_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur numeric; _new numeric;
BEGIN
  SELECT balance INTO _cur FROM organization_balance WHERE organization_id = _organization_id FOR UPDATE;
  IF _cur IS NULL OR _cur < _amount THEN RETURN FALSE; END IF;
  _new := _cur - _amount;
  UPDATE organization_balance SET balance = _new, total_spent = total_spent + _amount, updated_at = now() WHERE organization_id = _organization_id;
  INSERT INTO balance_transactions (organization_id, type, amount, balance_before, balance_after, description, reference_type, reference_id)
  VALUES (_organization_id, 'debit', _amount, _cur, _new, _description, _reference_type, _reference_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_organization_balance(_organization_id uuid, _amount numeric, _description text DEFAULT NULL, _reference_type text DEFAULT NULL, _reference_id text DEFAULT NULL, _created_by uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur numeric; _new numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_balance WHERE organization_id = _organization_id) THEN
    INSERT INTO organization_balance (organization_id, balance, total_credits_added, total_spent) VALUES (_organization_id, 0, 0, 0);
  END IF;
  SELECT balance INTO _cur FROM organization_balance WHERE organization_id = _organization_id FOR UPDATE;
  _new := _cur + _amount;
  UPDATE organization_balance SET balance = _new, total_credits_added = total_credits_added + _amount, updated_at = now() WHERE organization_id = _organization_id;
  INSERT INTO balance_transactions (organization_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_by)
  VALUES (_organization_id, 'credit', _amount, _cur, _new, _description, _reference_type, _reference_id, _created_by);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_organization_balance(_organization_id uuid, _amount numeric)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT balance >= _amount FROM organization_balance WHERE organization_id = _organization_id), FALSE)
$$;

CREATE OR REPLACE FUNCTION public.get_channel_by_api_token(_token text)
RETURNS TABLE(id uuid, name text, phone text, provider text, access_token text, waba_id text, organization_id uuid, user_id uuid, app_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone, c.provider, s.access_token, c.waba_id, c.organization_id, c.user_id, c.app_name
  FROM channels c JOIN channel_secrets s ON s.channel_id = c.id
  WHERE s.api_token = _token AND c.connected = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.purchase_product(_organization_id uuid, _product_id uuid, _quantity integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product RECORD; _total numeric; _is_sub boolean; _is_addon boolean; _exp timestamptz;
BEGIN
  SELECT * INTO _product FROM store_products WHERE id = _product_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found or inactive'; END IF;
  _is_sub := _product.product_type = 'subscription';
  _is_addon := _product.product_type = 'addon' OR _product.name ILIKE '%usuário%' OR _product.name ILIKE '%canal%' OR _product.name ILIKE '%adicional%' OR _product.name ILIKE '%higieniza%';
  IF (_is_sub OR _is_addon) THEN _quantity := 1; END IF;
  _total := _product.price * _quantity;
  IF NOT check_organization_balance(_organization_id, _total) THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  INSERT INTO store_purchases (organization_id, product_id, amount, quantity, status, purchased_at)
  VALUES (_organization_id, _product_id, _total, _quantity, 'completed', now());
  PERFORM debit_organization_balance(_organization_id, _total, 'Compra: ' || _product.name || CASE WHEN _quantity > 1 THEN ' x' || _quantity ELSE '' END, 'store_purchase', _product_id::text);
  IF _is_sub THEN
    _exp := GREATEST(COALESCE((SELECT subscription_paid_until FROM organizations WHERE id = _organization_id), now()), now()) + INTERVAL '30 days';
    UPDATE organizations SET subscription_paid_until = _exp, subscription_ends_at = _exp, subscription_status = 'active', updated_at = now() WHERE id = _organization_id;
  END IF;
  IF _is_addon AND NOT _is_sub THEN
    IF EXISTS (SELECT 1 FROM organization_addons WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true) THEN
      IF _product.name NOT ILIKE '%higieniza%' THEN
        UPDATE organization_addons SET quantity = quantity + _quantity, updated_at = now()
        WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true;
      END IF;
    ELSE
      INSERT INTO organization_addons (organization_id, product_id, quantity, price_per_unit, is_active)
      VALUES (_organization_id, _product_id, _quantity, _product.price, true);
    END IF;
    IF _product.name ILIKE '%usuário%' THEN UPDATE organizations SET max_users = COALESCE(max_users, 1) + _quantity, updated_at = now() WHERE id = _organization_id; END IF;
    IF _product.name ILIKE '%canal%' THEN UPDATE organizations SET max_channels = COALESCE(max_channels, 1) + _quantity, updated_at = now() WHERE id = _organization_id; END IF;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_real_counts(p_campaign_ids uuid[])
RETURNS TABLE(campaign_id uuid, recipients_count bigint, sent_count bigint, delivered_count bigint, read_count bigint, failed_count bigint, interacted_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ac AS (
    SELECT c.* FROM public.campaigns c WHERE c.id = ANY(p_campaign_ids)
      AND (auth.uid() IS NULL OR public.is_super_admin(auth.uid()) OR c.organization_id = public.get_user_organization_id(auth.uid()))
  ), cc AS (
    SELECT cr.campaign_id, COUNT(*)::bigint rc,
      COUNT(*) FILTER (WHERE cr.sent_at IS NOT NULL OR cr.status IN ('sent','delivered','read','failed'))::bigint sc,
      COUNT(*) FILTER (WHERE cr.status IN ('delivered','read') OR cr.delivered_at IS NOT NULL OR cr.read_at IS NOT NULL)::bigint dc,
      COUNT(*) FILTER (WHERE cr.status = 'read' OR cr.read_at IS NOT NULL)::bigint rd,
      COUNT(*) FILTER (WHERE cr.status = 'failed')::bigint fc,
      COUNT(*) FILTER (WHERE cr.button_clicked IS NOT NULL)::bigint ic
    FROM public.campaign_recipients cr WHERE cr.campaign_id = ANY(p_campaign_ids) GROUP BY cr.campaign_id
  )
  SELECT c.id,
    GREATEST(COALESCE(c.total_recipients,0), COALESCE(cc.rc,0))::bigint,
    GREATEST(COALESCE(c.sent_count,0), COALESCE(cc.sc,0), COALESCE(cc.dc,0) + COALESCE(cc.fc,0))::bigint,
    GREATEST(COALESCE(c.delivered_count,0), COALESCE(cc.dc,0))::bigint,
    COALESCE(cc.rd,0)::bigint,
    GREATEST(COALESCE(c.failed_count,0), COALESCE(cc.fc,0))::bigint,
    COALESCE(cc.ic,0)::bigint
  FROM ac c LEFT JOIN cc ON cc.campaign_id = c.id;
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_counts(p_campaign_id uuid)
RETURNS TABLE(total_sent bigint, total_delivered bigint, total_failed bigint, total_pending bigint, total_waiting_retry bigint, total_processing bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*) FILTER (WHERE status IN ('sent','delivered','read')),
    COUNT(*) FILTER (WHERE status IN ('delivered','read')),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'waiting_retry'),
    COUNT(*) FILTER (WHERE status = 'processing')
  FROM campaign_recipients WHERE campaign_id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.force_sync_all_campaign_counts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.campaigns c SET
    sent_count = GREATEST(COALESCE(c.sent_count,0), COALESCE(r.sent_count,0)),
    delivered_count = GREATEST(COALESCE(c.delivered_count,0), COALESCE(r.delivered_count,0)),
    failed_count = GREATEST(COALESCE(c.failed_count,0), COALESCE(r.failed_count,0)),
    total_recipients = GREATEST(COALESCE(c.total_recipients,0), COALESCE(r.recipients_count,0)),
    updated_at = now()
  FROM public.get_campaign_real_counts(ARRAY(SELECT id FROM public.campaigns WHERE status IN ('running','completed','paused'))) r
  WHERE c.id = r.campaign_id AND c.status IN ('running','completed','paused');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_sector_for_phone(_organization_id uuid, _phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.sector_id FROM campaign_recipients cr JOIN campaigns c ON c.id = cr.campaign_id
  WHERE c.organization_id = _organization_id AND c.sector_id IS NOT NULL
    AND right(regexp_replace(cr.phone, '\D', '', 'g'), 8) = right(regexp_replace(_phone, '\D', '', 'g'), 8)
  ORDER BY cr.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(_organization_id uuid, _phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM blacklist WHERE organization_id = _organization_id AND phone = _phone)
$$;

CREATE OR REPLACE FUNCTION public.delete_organization_cascade(_organization_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ch uuid[]; _t text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT array_agg(id) INTO _ch FROM channels WHERE organization_id = _organization_id;
  IF _ch IS NOT NULL THEN
    DELETE FROM conversation_metrics WHERE channel_id = ANY(_ch);
    DELETE FROM conversation_assignments WHERE channel_id = ANY(_ch);
    DELETE FROM channel_templates WHERE channel_id = ANY(_ch);
  END IF;
  DELETE FROM flow_sessions WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM flow_edges WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM flow_nodes WHERE flow_bot_id IN (SELECT id FROM flow_bots WHERE organization_id = _organization_id);
  DELETE FROM lead_activity_log WHERE lead_id IN (SELECT id FROM leads WHERE organization_id = _organization_id);
  DELETE FROM follow_up_logs WHERE instance_id IN (SELECT id FROM follow_up_instances WHERE organization_id = _organization_id);
  DELETE FROM follow_up_messages WHERE sequence_id IN (SELECT id FROM follow_up_sequences WHERE organization_id = _organization_id);
  DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE organization_id = _organization_id);
  DELETE FROM campaign_channels WHERE campaign_id IN (SELECT id FROM campaigns WHERE organization_id = _organization_id);
  DELETE FROM knowledge_documents WHERE agent_id IN (SELECT id FROM ai_agents WHERE organization_id = _organization_id);
  DELETE FROM referrals WHERE referrer_organization_id = _organization_id OR referred_organization_id = _organization_id;
  DELETE FROM user_sectors WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  DELETE FROM user_roles WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  DELETE FROM user_sessions WHERE user_id IN (SELECT user_id FROM profiles WHERE organization_id = _organization_id);
  FOREACH _t IN ARRAY ARRAY['flow_bots','redirect_links','webchat_links','balance_transactions','organization_balance','organization_addons',
    'store_purchases','pix_payments','referral_codes','auto_recharge_config','scheduled_messages','follow_up_instances','follow_up_sequences',
    'conversation_notes','conversation_memory','conversation_stats','campaigns','dispatch_costs','hygiene_history','blacklist','holidays',
    'business_hours','away_message_config','welcome_message_config','chatbot_config','ai_agents','channels','message_templates','quick_responses',
    'client_portfolios','leads','lead_tags','lead_custom_field_definitions','pipeline_stages','pipelines','attendant_availability','sectors',
    'webhooks','ura_config','profiles'] LOOP
    IF to_regclass('public.'||_t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE organization_id = $1', _t) USING _organization_id;
    END IF;
  END LOOP;
  DELETE FROM organizations WHERE id = _organization_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_session(_session_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_sessions WHERE user_id = auth.uid() AND session_token = _session_token)
$$;
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.user_sessions SET last_active_at = now() WHERE user_id = auth.uid(); RETURN TRUE; END;
$$;
CREATE OR REPLACE FUNCTION public.register_user_session(_session_token text, _device_info text DEFAULT NULL, _ip_address text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_sessions (user_id, session_token, device_info, ip_address, logged_in_at, last_active_at)
  VALUES (auth.uid(), _session_token, _device_info, _ip_address, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET session_token = EXCLUDED.session_token, device_info = EXCLUDED.device_info,
    ip_address = EXCLUDED.ip_address, logged_in_at = now(), last_active_at = now();
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_default_sector(_organization_id uuid, _sector_id uuid, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(), 'admin') AND public.get_user_organization_id(auth.uid()) = _organization_id)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _sector_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = _sector_id AND s.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'sector does not belong to organization';
  END IF;
  UPDATE public.organizations SET default_sector_id = _sector_id, auto_distribute_enabled = COALESCE(_enabled, false), updated_at = now() WHERE id = _organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_auto_reply_flags(p_organization_id uuid, p_auto_blacklist_enabled boolean, p_decline_message_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR (public.is_admin_or_supervisor(auth.uid()) AND p_organization_id = public.get_user_organization_id(auth.uid()))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.organizations SET auto_blacklist_enabled = p_auto_blacklist_enabled, decline_message_enabled = p_decline_message_enabled WHERE id = p_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(org_id uuid)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c varchar;
BEGIN
  SELECT code INTO _c FROM public.referral_codes WHERE organization_id = org_id;
  IF _c IS NOT NULL THEN RETURN _c; END IF;
  LOOP
    _c := public.generate_referral_code();
    BEGIN
      INSERT INTO public.referral_codes (organization_id, code) VALUES (org_id, _c);
      RETURN _c;
    EXCEPTION WHEN unique_violation THEN CONTINUE;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_addon(_addon_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a RECORD; _p RECORD;
BEGIN
  SELECT * INTO _a FROM organization_addons WHERE id = _addon_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add-on not found or already cancelled'; END IF;
  SELECT * INTO _p FROM store_products WHERE id = _a.product_id;
  UPDATE organization_addons SET is_active = false, cancelled_at = now(), updated_at = now() WHERE id = _addon_id;
  IF _p.name ILIKE '%usuário%' THEN UPDATE organizations SET max_users = GREATEST(1, COALESCE(max_users,1) - _a.quantity), updated_at = now() WHERE id = _a.organization_id; END IF;
  IF _p.name ILIKE '%canal%' THEN UPDATE organizations SET max_channels = GREATEST(1, COALESCE(max_channels,1) - _a.quantity), updated_at = now() WHERE id = _a.organization_id; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_product_to_organization(_organization_id uuid, _product_id uuid, _quantity integer DEFAULT 1, _is_free boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p RECORD; _total numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO _p FROM store_products WHERE id = _product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  _total := CASE WHEN _is_free THEN 0 ELSE _p.price * _quantity END;
  INSERT INTO store_purchases (organization_id, product_id, amount, quantity, status, purchased_at)
  VALUES (_organization_id, _product_id, _total, _quantity, 'completed', now());
  IF NOT _is_free AND _total > 0 THEN
    PERFORM debit_organization_balance(_organization_id, _total, 'Compra manual (admin): ' || _p.name || ' x' || _quantity, 'admin_purchase', _product_id::text);
  END IF;
  IF _p.product_type = 'subscription' THEN
    UPDATE organizations SET subscription_paid_until = COALESCE(subscription_paid_until, now()) + INTERVAL '30 days', subscription_status = 'active', updated_at = now() WHERE id = _organization_id;
  END IF;
  IF _p.name ILIKE '%usuário%' OR _p.name ILIKE '%canal%' OR _p.name ILIKE '%adicional%' THEN
    IF EXISTS (SELECT 1 FROM organization_addons WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true) THEN
      UPDATE organization_addons SET quantity = quantity + _quantity, updated_at = now() WHERE organization_id = _organization_id AND product_id = _product_id AND is_active = true;
    ELSE
      INSERT INTO organization_addons (organization_id, product_id, quantity, price_per_unit, is_active)
      VALUES (_organization_id, _product_id, _quantity, CASE WHEN _is_free THEN 0 ELSE _p.price END, true);
    END IF;
    IF _p.name ILIKE '%usuário%' THEN UPDATE organizations SET max_users = COALESCE(max_users,1) + _quantity, updated_at = now() WHERE id = _organization_id; END IF;
    IF _p.name ILIKE '%canal%' THEN UPDATE organizations SET max_channels = COALESCE(max_channels,1) + _quantity, updated_at = now() WHERE id = _organization_id; END IF;
  END IF;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

DO $$
DECLARE j text; jobs text[][] := ARRAY[
  ['campaign-processor','* * * * *'],['campaign-watchdog','*/2 * * * *'],['scheduled-message-sender','* * * * *'],
  ['follow-up-sender','*/5 * * * *'],['flow-bot-follow-up','*/5 * * * *'],['auto-recharge-check','0 * * * *'],
  ['subscription-renewal','0 6 * * *'],['cleanup-old-data','30 4 * * *'],['lead-cleanup-cron','0 5 */2 * *']];
  i int;
BEGIN
  FOR i IN 1..array_length(jobs,1) LOOP
    j := 'optimus-' || jobs[i][1];
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = j;
    PERFORM cron.schedule(j, jobs[i][2], format(
      $f$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$f$,
      'https://vytjufibiwhtvsnvvqri.supabase.co/functions/v1/' || jobs[i][1],
      '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dGp1ZmliaXdodHZzbnZ2cXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzI2MzYsImV4cCI6MjA5MDQwODYzNn0.5rgCe8wEG-Ebi5h0bEL00fOIyVzBH0_LsaxBFtwmqNI"}'));
  END LOOP;
END $$;