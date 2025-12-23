-- Add is_read column to whatsapp_messages table
ALTER TABLE public.whatsapp_messages 
ADD COLUMN is_read BOOLEAN DEFAULT false;

-- Mark all existing messages as read
UPDATE public.whatsapp_messages SET is_read = true;

-- Create index for faster unread queries
CREATE INDEX idx_whatsapp_messages_unread 
ON public.whatsapp_messages (organization_id, is_read, direction) 
WHERE is_read = false AND direction = 'inbound';