-- Create table for incoming WhatsApp messages
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  status TEXT DEFAULT 'received',
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_whatsapp_messages_channel ON public.whatsapp_messages(channel_id);
CREATE INDEX idx_whatsapp_messages_sender ON public.whatsapp_messages(sender_phone);
CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view messages from their organization channels"
ON public.whatsapp_messages
FOR SELECT
USING (
  channel_id IN (
    SELECT c.id FROM public.channels c
    JOIN public.profiles p ON p.organization_id = c.organization_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "System can insert messages"
ON public.whatsapp_messages
FOR INSERT
WITH CHECK (true);

-- Enable realtime for messages
ALTER TABLE public.whatsapp_messages REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_messages_updated_at
BEFORE UPDATE ON public.whatsapp_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();