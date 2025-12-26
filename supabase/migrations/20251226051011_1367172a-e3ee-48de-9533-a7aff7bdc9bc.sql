-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own channels" ON channels;
DROP POLICY IF EXISTS "Users can update their own channels" ON channels;
DROP POLICY IF EXISTS "Users can delete their own channels" ON channels;
DROP POLICY IF EXISTS "Users can create their own channels" ON channels;

-- Create organization-based policies (members of same org can manage channels)
CREATE POLICY "Organization members can view channels"
ON channels FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  )
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can create channels"
ON channels FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organization admins can update channels"
ON channels FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  )
  AND (
    auth.uid() = user_id 
    OR is_admin(auth.uid()) 
    OR is_admin_or_supervisor(auth.uid())
  )
);

CREATE POLICY "Organization admins can delete channels"
ON channels FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid()
  )
  AND (
    auth.uid() = user_id 
    OR is_admin(auth.uid()) 
    OR is_admin_or_supervisor(auth.uid())
  )
);