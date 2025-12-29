-- Add agent_id column to chatbot_config to link channels with specific AI agents
ALTER TABLE public.chatbot_config 
ADD COLUMN agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_chatbot_config_agent_id ON public.chatbot_config(agent_id);