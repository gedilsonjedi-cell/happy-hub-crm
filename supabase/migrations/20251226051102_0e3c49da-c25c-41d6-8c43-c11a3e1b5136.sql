-- Drop the policies we just created
DROP POLICY IF EXISTS "Organization admins can update channels" ON channels;
DROP POLICY IF EXISTS "Organization admins can delete channels" ON channels;

-- Recreate with super_admin having FULL access
CREATE POLICY "Organization admins can update channels"
ON channels FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
    AND (auth.uid() = user_id OR is_admin(auth.uid()) OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Organization admins can delete channels"
ON channels FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
    AND (auth.uid() = user_id OR is_admin(auth.uid()) OR is_admin_or_supervisor(auth.uid()))
  )
);