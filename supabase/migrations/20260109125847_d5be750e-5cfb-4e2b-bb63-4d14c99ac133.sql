
-- Simplify RLS policy for whatsapp_messages to ensure all organization members can see messages
-- Drop existing policy
DROP POLICY IF EXISTS "Users can view messages from their organization channels" ON whatsapp_messages;

-- Create a simpler and more efficient policy
CREATE POLICY "Users can view messages from their organization channels"
ON whatsapp_messages
FOR SELECT
USING (
  -- Super admin can see everything
  is_super_admin(auth.uid()) 
  OR 
  -- Organization members can see messages from channels that belong to their organization
  channel_id IN (
    SELECT id FROM channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

-- Also update the UPDATE policy to be consistent
DROP POLICY IF EXISTS "Users can mark messages as read" ON whatsapp_messages;

CREATE POLICY "Users can mark messages as read"
ON whatsapp_messages
FOR UPDATE
USING (
  is_super_admin(auth.uid()) 
  OR 
  channel_id IN (
    SELECT id FROM channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR 
  channel_id IN (
    SELECT id FROM channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);
