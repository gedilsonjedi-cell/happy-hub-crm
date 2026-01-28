-- Add unique constraint on message_id to prevent duplicates at database level
-- First, remove duplicates keeping only the first one
DELETE FROM whatsapp_messages a
USING whatsapp_messages b
WHERE a.id > b.id 
AND a.message_id = b.message_id
AND a.message_id IS NOT NULL;

-- Then add the unique constraint
ALTER TABLE whatsapp_messages 
ADD CONSTRAINT whatsapp_messages_message_id_unique UNIQUE (message_id);