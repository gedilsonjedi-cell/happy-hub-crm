-- Add components column to store template structure including buttons
ALTER TABLE public.message_templates 
ADD COLUMN IF NOT EXISTS components JSONB DEFAULT NULL;

-- Add comment explaining the structure
COMMENT ON COLUMN public.message_templates.components IS 'Template components including header, body, footer, and buttons. Structure: { "header": {...}, "body": {...}, "footer": {...}, "buttons": [{ "type": "URL|PHONE|QUICK_REPLY", "text": "...", "url": "...", "phone": "..." }] }';