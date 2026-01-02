-- Add field to track when bot was paused by human intervention
ALTER TABLE public.conversation_assignments 
ADD COLUMN IF NOT EXISTS bot_paused_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.conversation_assignments.bot_paused_until IS 'Timestamp until which the bot should not respond. Set when a human attendant sends a message.';