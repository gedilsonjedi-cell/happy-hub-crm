
CREATE OR REPLACE FUNCTION public.reset_conversation_unread(
  p_channel_id uuid,
  p_phone_variants text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_stats
  SET unread_count = 0, updated_at = now()
  WHERE channel_id = p_channel_id
    AND conversation_phone = ANY(p_phone_variants)
    AND unread_count > 0;
END;
$$;
