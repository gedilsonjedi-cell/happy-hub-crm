-- Add display_order column to quick_responses table
ALTER TABLE public.quick_responses 
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Update existing rows with sequential order based on created_at
WITH ordered_responses AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC) as new_order
  FROM public.quick_responses
)
UPDATE public.quick_responses qr
SET display_order = ordered_responses.new_order
FROM ordered_responses
WHERE qr.id = ordered_responses.id;