-- Create pipelines table
CREATE TABLE public.pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES public.organizations(id),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view default pipelines" 
ON public.pipelines 
FOR SELECT 
USING (is_default = true OR organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create pipelines for their organization" 
ON public.pipelines 
FOR INSERT 
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their organization pipelines" 
ON public.pipelines 
FOR UPDATE 
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete their organization pipelines" 
ON public.pipelines 
FOR DELETE 
USING (is_default = false AND organization_id IN (
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
));

-- Add pipeline_id to pipeline_stages
ALTER TABLE public.pipeline_stages 
ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id);

-- Create the default pipeline
INSERT INTO public.pipelines (id, name, description, is_default, organization_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pipeline Padrão', 'Pipeline padrão da plataforma com estágios pré-definidos', true, null);

-- Update existing stages to belong to the default pipeline
UPDATE public.pipeline_stages 
SET pipeline_id = '00000000-0000-0000-0000-000000000001'
WHERE pipeline_id IS NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_pipelines_updated_at
BEFORE UPDATE ON public.pipelines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();