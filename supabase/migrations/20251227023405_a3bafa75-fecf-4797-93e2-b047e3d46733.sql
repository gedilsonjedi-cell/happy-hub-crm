-- Create scheduled_messages table
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES public.message_templates(id) ON DELETE CASCADE,
  destination_phone TEXT NOT NULL,
  destination_name TEXT,
  variable_values JSONB DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create indexes for efficient querying
CREATE INDEX idx_scheduled_messages_status_scheduled ON public.scheduled_messages(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_scheduled_messages_organization ON public.scheduled_messages(organization_id);
CREATE INDEX idx_scheduled_messages_channel ON public.scheduled_messages(channel_id);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view scheduled messages in their organization"
ON public.scheduled_messages
FOR SELECT
USING (organization_id = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can create scheduled messages in their organization"
ON public.scheduled_messages
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization_id(auth.uid()) 
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update their own scheduled messages"
ON public.scheduled_messages
FOR UPDATE
USING (created_by = auth.uid() AND status = 'pending');

CREATE POLICY "Users can delete their own pending scheduled messages"
ON public.scheduled_messages
FOR DELETE
USING (created_by = auth.uid() AND status = 'pending');

-- Super admins can view all
CREATE POLICY "Super admins can view all scheduled messages"
ON public.scheduled_messages
FOR SELECT
USING (is_super_admin(auth.uid()));

-- System can manage all (for the cron job)
CREATE POLICY "System can manage scheduled messages"
ON public.scheduled_messages
FOR ALL
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_messages_updated_at
BEFORE UPDATE ON public.scheduled_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();