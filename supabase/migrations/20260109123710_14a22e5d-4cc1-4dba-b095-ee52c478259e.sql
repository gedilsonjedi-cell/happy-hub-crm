-- Fix RLS policy for lead_tags to allow super admins to insert in any organization
DROP POLICY IF EXISTS "Users can create tags for their organization" ON lead_tags;

-- Recreate with super admin bypass
CREATE POLICY "Users can create tags for their organization" 
ON lead_tags 
FOR INSERT 
WITH CHECK (
  is_super_admin(auth.uid()) OR 
  organization_id = get_user_organization_id(auth.uid())
);