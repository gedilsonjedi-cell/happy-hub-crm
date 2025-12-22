-- Create table for AI agent configuration
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(50) NOT NULL,
  nickname VARCHAR(20),
  sign_conversations BOOLEAN DEFAULT true,
  communication_style VARCHAR(50) DEFAULT 'consultivo',
  agent_profile VARCHAR(50) DEFAULT 'vendedor',
  objective TEXT,
  company_info TEXT,
  products_services TEXT,
  faq TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own agents" 
ON public.ai_agents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agents" 
ON public.ai_agents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents" 
ON public.ai_agents 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agents" 
ON public.ai_agents 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();