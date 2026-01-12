-- Add error_message column to whatsapp_messages for storing send errors
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS error_message TEXT;