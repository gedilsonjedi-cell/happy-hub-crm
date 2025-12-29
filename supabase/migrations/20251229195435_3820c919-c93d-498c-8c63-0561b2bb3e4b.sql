-- Add campaign_chatbot_id column to conversation_assignments to track which chatbot to use for campaign-initiated conversations
ALTER TABLE public.conversation_assignments 
ADD COLUMN campaign_chatbot_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversation_assignments.campaign_chatbot_id IS 'Chatbot ID from campaign that initiated this conversation. Takes priority over channel default chatbot.';