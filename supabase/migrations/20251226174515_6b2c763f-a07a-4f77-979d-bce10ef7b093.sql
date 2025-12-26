-- Follow-up sequences configuration (templates for follow-up)
CREATE TABLE public.follow_up_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Follow-up messages in a sequence
CREATE TABLE public.follow_up_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.message_templates(id),
  day_offset INTEGER NOT NULL DEFAULT 1, -- Days after entering follow-up
  send_time TIME NOT NULL DEFAULT '10:00:00', -- Specific time to send
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Active follow-up instances for leads
CREATE TABLE public.follow_up_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.follow_up_sequences(id),
  channel_id UUID REFERENCES public.channels(id),
  organization_id UUID REFERENCES public.organizations(id),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_by UUID,
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed, cancelled
  last_message_sent_at TIMESTAMP WITH TIME ZONE,
  next_message_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Follow-up sent messages log
CREATE TABLE public.follow_up_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.follow_up_instances(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.follow_up_messages(id),
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent', -- sent, failed
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for follow_up_sequences
CREATE POLICY "Users can view their organization sequences" 
ON public.follow_up_sequences 
FOR SELECT 
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage sequences" 
ON public.follow_up_sequences 
FOR ALL 
USING (
  organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())
  AND is_admin_or_supervisor(auth.uid())
);

-- RLS Policies for follow_up_messages
CREATE POLICY "Users can view messages of their organization sequences" 
ON public.follow_up_messages 
FOR SELECT 
USING (
  sequence_id IN (
    SELECT id FROM public.follow_up_sequences 
    WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Admins can manage messages" 
ON public.follow_up_messages 
FOR ALL 
USING (
  sequence_id IN (
    SELECT id FROM public.follow_up_sequences 
    WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())
    AND is_admin_or_supervisor(auth.uid())
  )
);

-- RLS Policies for follow_up_instances
CREATE POLICY "Users can view their organization instances" 
ON public.follow_up_instances 
FOR SELECT 
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage instances" 
ON public.follow_up_instances 
FOR ALL 
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- RLS Policies for follow_up_logs
CREATE POLICY "Users can view their organization logs" 
ON public.follow_up_logs 
FOR SELECT 
USING (
  instance_id IN (
    SELECT id FROM public.follow_up_instances 
    WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- Update triggers
CREATE TRIGGER update_follow_up_sequences_updated_at
BEFORE UPDATE ON public.follow_up_sequences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_follow_up_messages_updated_at
BEFORE UPDATE ON public.follow_up_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_follow_up_instances_updated_at
BEFORE UPDATE ON public.follow_up_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();