-- Create storage bucket for knowledge documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-docs', 'knowledge-docs', false);

-- Create RLS policies for the bucket
CREATE POLICY "Users can upload their own documents"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'knowledge-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'knowledge-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own documents"
ON storage.objects
FOR DELETE
USING (bucket_id = 'knowledge-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create table to track uploaded documents
CREATE TABLE public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own documents"
ON public.knowledge_documents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
ON public.knowledge_documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
ON public.knowledge_documents
FOR DELETE
USING (auth.uid() = user_id);