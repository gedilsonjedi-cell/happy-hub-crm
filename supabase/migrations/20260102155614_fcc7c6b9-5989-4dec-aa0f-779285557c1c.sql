-- Create table to store conversation memory/summary
CREATE TABLE public.conversation_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  memory_summary TEXT NOT NULL,
  collected_info JSONB DEFAULT '{}',
  last_interaction_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(channel_id, contact_phone)
);

-- Enable RLS
ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;

-- Create policy for organization access
CREATE POLICY "Organization members can manage conversation memory"
ON public.conversation_memory
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_conversation_memory_lookup ON public.conversation_memory(channel_id, contact_phone);
CREATE INDEX idx_conversation_memory_expires ON public.conversation_memory(expires_at);

-- Add comment
COMMENT ON TABLE public.conversation_memory IS 'Stores AI chatbot conversation memory/summary for context retention across sessions. Expires after 7 days.';