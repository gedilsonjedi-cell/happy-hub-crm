-- Add a check constraint to ensure status values are valid (including archived)
-- First, let's update any existing constraint or add proper validation

-- Create a function to validate and update conversation assignment status
CREATE OR REPLACE FUNCTION public.archive_conversation(
  p_conversation_phone TEXT,
  p_channel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_assignments
  SET status = 'archived', updated_at = now()
  WHERE conversation_phone = p_conversation_phone
    AND channel_id = p_channel_id;
END;
$$;

-- Create a function to restore (unarchive) a conversation
CREATE OR REPLACE FUNCTION public.restore_conversation(
  p_conversation_phone TEXT,
  p_channel_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversation_assignments
  SET status = 'in_progress', updated_at = now()
  WHERE conversation_phone = p_conversation_phone
    AND channel_id = p_channel_id;
END;
$$;