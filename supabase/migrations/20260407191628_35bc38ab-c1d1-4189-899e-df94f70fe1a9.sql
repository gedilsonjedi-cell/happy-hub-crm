
-- Remove overly permissive INSERT policies
DROP POLICY IF EXISTS "System can insert metrics" ON public.conversation_metrics;
DROP POLICY IF EXISTS "System can insert messages" ON public.whatsapp_messages;
