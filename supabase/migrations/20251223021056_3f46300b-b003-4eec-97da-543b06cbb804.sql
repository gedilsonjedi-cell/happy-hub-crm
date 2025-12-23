-- Create table for attendant availability and queue management
CREATE TABLE public.attendant_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  is_available BOOLEAN DEFAULT false,
  current_conversations INTEGER DEFAULT 0,
  max_conversations INTEGER DEFAULT 5,
  last_assignment_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attendant_availability ENABLE ROW LEVEL SECURITY;

-- Policies for attendant_availability
CREATE POLICY "Users can view their own availability"
  ON public.attendant_availability FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own availability"
  ON public.attendant_availability FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own availability"
  ON public.attendant_availability FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can view all availability for distribution"
  ON public.attendant_availability FOR SELECT
  USING (true);

-- Create table for chatbot configuration
CREATE TABLE public.chatbot_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  channel_id UUID REFERENCES public.channels(id),
  user_id UUID NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  auto_reply_when_unavailable BOOLEAN DEFAULT true,
  welcome_message TEXT DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo hoje?',
  transfer_message TEXT DEFAULT 'Vou transferir você para um de nossos atendentes. Por favor, aguarde.',
  away_message TEXT DEFAULT 'No momento todos os atendentes estão ocupados. Em breve alguém irá atendê-lo.',
  qualification_keywords TEXT[] DEFAULT ARRAY['preço', 'valor', 'comprar', 'interesse', 'orçamento'],
  auto_qualify_enabled BOOLEAN DEFAULT true,
  initial_stage_id UUID REFERENCES public.pipeline_stages(id),
  qualified_stage_id UUID REFERENCES public.pipeline_stages(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;

-- Policies for chatbot_config
CREATE POLICY "Users can view their chatbot config"
  ON public.chatbot_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their chatbot config"
  ON public.chatbot_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their chatbot config"
  ON public.chatbot_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their chatbot config"
  ON public.chatbot_config FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "System can read chatbot config"
  ON public.chatbot_config FOR SELECT
  USING (true);

-- Create table for conversation assignments
CREATE TABLE public.conversation_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_phone TEXT NOT NULL,
  channel_id UUID REFERENCES public.channels(id),
  assigned_to UUID,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'pending',
  is_bot_handling BOOLEAN DEFAULT true,
  lead_id UUID REFERENCES public.leads(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(conversation_phone, channel_id)
);

-- Enable RLS
ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for conversation_assignments
CREATE POLICY "Users can view their assignments"
  ON public.conversation_assignments FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "System can manage assignments"
  ON public.conversation_assignments FOR ALL
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_attendant_availability_updated_at
  BEFORE UPDATE ON public.attendant_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chatbot_config_updated_at
  BEFORE UPDATE ON public.chatbot_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversation_assignments_updated_at
  BEFORE UPDATE ON public.conversation_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for assignments
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_assignments;