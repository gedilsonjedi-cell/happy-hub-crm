-- Add chatbot_id column to campaigns table to allow custom chatbot selection per campaign
ALTER TABLE public.campaigns 
ADD COLUMN chatbot_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_campaigns_chatbot_id ON public.campaigns(chatbot_id);

COMMENT ON COLUMN public.campaigns.chatbot_id IS 'Optional: Custom chatbot to use for this campaign. If null and chatbot_enabled=true, uses channel default chatbot.';