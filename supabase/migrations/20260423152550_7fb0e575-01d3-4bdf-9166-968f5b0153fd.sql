CREATE OR REPLACE FUNCTION public.delete_channel_cascade(_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _org_id uuid;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.channels
  WHERE id = _channel_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF NOT (
    public.is_super_admin(_caller)
    OR (
      public.get_user_organization_id(_caller) = _org_id
      AND public.is_admin_or_supervisor(_caller)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete this channel';
  END IF;

  DELETE FROM public.chatbot_config WHERE channel_id = _channel_id;
  DELETE FROM public.campaign_channels WHERE channel_id = _channel_id;
  DELETE FROM public.channel_templates WHERE channel_id = _channel_id;
  DELETE FROM public.conversation_memory WHERE channel_id = _channel_id;
  DELETE FROM public.conversation_notes WHERE channel_id = _channel_id;
  DELETE FROM public.scheduled_messages WHERE channel_id = _channel_id;

  UPDATE public.conversation_assignments
  SET channel_id = NULL
  WHERE channel_id = _channel_id;

  UPDATE public.follow_up_instances
  SET channel_id = NULL
  WHERE channel_id = _channel_id;

  UPDATE public.flow_sessions
  SET channel_id = NULL
  WHERE channel_id = _channel_id;

  UPDATE public.conversation_stats
  SET channel_id = NULL
  WHERE channel_id = _channel_id;

  DELETE FROM public.channels
  WHERE id = _channel_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_channel_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_channel_cascade(uuid) TO authenticated;

ALTER TABLE public.chatbot_config
  DROP CONSTRAINT IF EXISTS chatbot_config_channel_id_fkey,
  ADD CONSTRAINT chatbot_config_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.conversation_assignments
  DROP CONSTRAINT IF EXISTS conversation_assignments_channel_id_fkey,
  ADD CONSTRAINT conversation_assignments_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.conversation_notes
  DROP CONSTRAINT IF EXISTS conversation_notes_channel_id_fkey,
  ADD CONSTRAINT conversation_notes_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.conversation_stats
  DROP CONSTRAINT IF EXISTS conversation_stats_channel_id_fkey,
  ADD CONSTRAINT conversation_stats_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.flow_sessions
  DROP CONSTRAINT IF EXISTS flow_sessions_channel_id_fkey,
  ADD CONSTRAINT flow_sessions_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;

ALTER TABLE public.follow_up_instances
  DROP CONSTRAINT IF EXISTS follow_up_instances_channel_id_fkey,
  ADD CONSTRAINT follow_up_instances_channel_id_fkey
  FOREIGN KEY (channel_id)
  REFERENCES public.channels(id)
  ON DELETE SET NULL;