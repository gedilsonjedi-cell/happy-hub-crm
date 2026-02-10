
-- Fix RLS policy to handle conversation_assignments with NULL channel_id
-- These are created by campaigns/chatbots that didn't set the channel properly
-- We allow access if the assigned_to user belongs to the same organization

DROP POLICY IF EXISTS "Users can view conversations in their sectors" ON public.conversation_assignments;

CREATE POLICY "Users can view conversations in their sectors"
ON public.conversation_assignments
FOR SELECT
USING (
  (
    -- Standard check: channel belongs to user's organization
    channel_id IN (
      SELECT channels.id FROM channels 
      WHERE channels.organization_id = get_user_organization_id(auth.uid())
    )
    -- NEW: Allow NULL channel_id if the assigned user belongs to same org
    OR (
      channel_id IS NULL 
      AND assigned_to IN (
        SELECT p.user_id FROM profiles p 
        WHERE p.organization_id = get_user_organization_id(auth.uid())
      )
    )
    OR is_super_admin(auth.uid())
  )
  AND user_can_access_conversation(sector_id)
);

-- Also fix UPDATE policy to handle NULL channel_id
DROP POLICY IF EXISTS "Organization members can update conversation assignments" ON public.conversation_assignments;

CREATE POLICY "Organization members can update conversation assignments"
ON public.conversation_assignments
FOR UPDATE
USING (
  is_super_admin(auth.uid()) 
  OR channel_id IN (
    SELECT channels.id FROM channels 
    WHERE channels.organization_id = get_user_organization_id(auth.uid())
  )
  OR (
    channel_id IS NULL 
    AND assigned_to IN (
      SELECT p.user_id FROM profiles p 
      WHERE p.organization_id = get_user_organization_id(auth.uid())
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid()) 
  OR channel_id IN (
    SELECT channels.id FROM channels 
    WHERE channels.organization_id = get_user_organization_id(auth.uid())
  )
  OR (
    channel_id IS NULL 
    AND assigned_to IN (
      SELECT p.user_id FROM profiles p 
      WHERE p.organization_id = get_user_organization_id(auth.uid())
    )
  )
);
