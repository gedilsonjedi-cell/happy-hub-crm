-- Allow users to update is_read on messages from their organization channels
CREATE POLICY "Users can mark messages as read" 
ON public.whatsapp_messages 
FOR UPDATE 
USING (
  channel_id IN (
    SELECT c.id FROM channels c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  channel_id IN (
    SELECT c.id FROM channels c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE p.user_id = auth.uid()
  )
);