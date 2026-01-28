-- Add follow-up tracking columns to flow_sessions
ALTER TABLE public.flow_sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient follow-up queries
CREATE INDEX IF NOT EXISTS idx_flow_sessions_follow_up 
ON public.flow_sessions (status, next_follow_up_at, follow_up_count) 
WHERE status = 'active';

-- Update trigger to track last activity
CREATE OR REPLACE FUNCTION public.update_flow_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity_at = now();
  NEW.updated_at = now();
  -- Reset follow-up count when user responds
  IF OLD.current_node_id IS DISTINCT FROM NEW.current_node_id THEN
    NEW.follow_up_count = 0;
    NEW.next_follow_up_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_flow_session_activity ON public.flow_sessions;
CREATE TRIGGER trigger_flow_session_activity
BEFORE UPDATE ON public.flow_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_flow_session_activity();