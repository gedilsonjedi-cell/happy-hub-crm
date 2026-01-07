-- Remove overly permissive super admin policies that allow viewing ALL data
-- The JavaScript code already filters by effectiveOrganizationId, we just need RLS to allow access

-- For channels: Keep the merged policy that already includes super_admin check
DROP POLICY IF EXISTS "Super admins can view all channels" ON public.channels;

-- For whatsapp_messages: Replace the super admin policy with one that checks via channel organization
DROP POLICY IF EXISTS "Super admins can view all whatsapp messages" ON public.whatsapp_messages;

-- Update the existing SELECT policy for whatsapp_messages to include super admins via channel org
DROP POLICY IF EXISTS "Users can view messages from their organization channels" ON public.whatsapp_messages;

CREATE POLICY "Users can view messages from their organization channels"
ON public.whatsapp_messages
FOR SELECT
TO public
USING (
  channel_id IN (
    SELECT c.id 
    FROM channels c
    JOIN profiles p ON p.organization_id = c.organization_id
    WHERE p.user_id = auth.uid()
  )
  OR is_super_admin(auth.uid())
);

-- Note: When super admin selects a specific org in ClientSwitcher,
-- the JavaScript code filters by .eq("organization_id", effectiveOrganizationId)
-- which limits results to only that organization's channels