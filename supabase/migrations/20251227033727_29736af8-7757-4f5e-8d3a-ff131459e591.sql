-- Create conversation_notes table for notes that appear in the chat timeline
CREATE TABLE public.conversation_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  channel_id UUID REFERENCES public.channels(id),
  contact_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view notes from their organization"
ON public.conversation_notes
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create notes for their organization"
ON public.conversation_notes
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own notes"
ON public.conversation_notes
FOR DELETE
USING (created_by = auth.uid());

-- Create index for faster queries
CREATE INDEX idx_conversation_notes_contact ON public.conversation_notes(channel_id, contact_phone);
CREATE INDEX idx_conversation_notes_created_at ON public.conversation_notes(created_at);