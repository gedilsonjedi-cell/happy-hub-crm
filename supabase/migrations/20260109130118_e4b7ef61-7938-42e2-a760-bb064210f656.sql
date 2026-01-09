
-- Fix RLS policy for conversation_assignments to allow organization members to see all assignments
-- This is needed so attendants can see "new" conversations (without assignee) and supervisors can see all

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their assignments" ON conversation_assignments;

-- Create new policy that allows organization members to see all assignments for their channels
CREATE POLICY "Organization members can view conversation assignments"
ON conversation_assignments
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR
  channel_id IN (
    SELECT id FROM channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

-- Also need UPDATE policy for organization members to assign/update conversations
DROP POLICY IF EXISTS "Organization members can update assignments" ON conversation_assignments;

CREATE POLICY "Organization members can update conversation assignments"
ON conversation_assignments
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

-- Also need INSERT policy for organization members
DROP POLICY IF EXISTS "Organization members can create assignments" ON conversation_assignments;

CREATE POLICY "Organization members can insert conversation assignments"
ON conversation_assignments
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  channel_id IN (
    SELECT id FROM channels 
    WHERE organization_id = get_user_organization_id(auth.uid())
  )
);
