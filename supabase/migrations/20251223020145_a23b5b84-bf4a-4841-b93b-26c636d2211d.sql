-- Create table for quick responses (respostas rápidas)
CREATE TABLE public.quick_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  category TEXT DEFAULT 'geral',
  is_global BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_responses ENABLE ROW LEVEL SECURITY;

-- Policies for quick_responses
CREATE POLICY "Users can view their own and global quick responses"
  ON public.quick_responses
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR is_global = true
    OR organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own quick responses"
  ON public.quick_responses
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quick responses"
  ON public.quick_responses
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quick responses"
  ON public.quick_responses
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_quick_responses_updated_at
  BEFORE UPDATE ON public.quick_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();