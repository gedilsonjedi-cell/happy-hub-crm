CREATE OR REPLACE FUNCTION public.delete_channel_cascade(_channel_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _caller uuid := auth.uid();
  _org_id uuid;
  _caller_org uuid;
  _t text;
BEGIN
  SELECT organization_id INTO _org_id FROM public.channels WHERE id = _channel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Channel not found'; END IF;

  SELECT organization_id INTO _caller_org FROM public.profiles WHERE user_id = _caller LIMIT 1;
  IF NOT (
    public.is_super_admin(_caller)
    OR (_caller_org IS NOT NULL AND _caller_org = _org_id AND EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role IN ('admin','supervisor')))
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this channel';
  END IF;

  FOREACH _t IN ARRAY ARRAY['chatbot_config','campaign_channels','channel_templates','conversation_memory',
    'conversation_notes','scheduled_messages','channel_secrets','ura_config','welcome_message_sent'] LOOP
    IF to_regclass('public.'||_t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE channel_id = $1', _t) USING _channel_id;
    END IF;
  END LOOP;

  FOREACH _t IN ARRAY ARRAY['conversation_assignments','follow_up_instances','flow_sessions',
    'conversation_stats','conversation_metrics','webchat_links','ura_webhook_logs'] LOOP
    IF to_regclass('public.'||_t) IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET channel_id = NULL WHERE channel_id = $1', _t) USING _channel_id;
    END IF;
  END LOOP;

  DELETE FROM public.channels WHERE id = _channel_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_channel_cascade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_channel_cascade(uuid) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_secrets TO authenticated;
GRANT ALL ON public.channel_secrets TO service_role;
NOTIFY pgrst, 'reload schema';