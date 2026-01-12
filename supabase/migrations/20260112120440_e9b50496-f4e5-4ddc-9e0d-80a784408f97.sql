-- Add sector_id to campaigns table for department-based filtering
ALTER TABLE public.campaigns 
ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Add index for faster department-based queries
CREATE INDEX idx_campaigns_sector_id ON public.campaigns(sector_id);

-- Add sector_id to conversation_assignments for department-based conversation filtering
ALTER TABLE public.conversation_assignments 
ADD COLUMN sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL;

-- Add index for faster department-based queries on conversations
CREATE INDEX idx_conversation_assignments_sector_id ON public.conversation_assignments(sector_id);