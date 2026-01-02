-- Drop the existing insert policy
DROP POLICY IF EXISTS "Organization members can create channels" ON public.channels;

-- Create a new insert policy that allows:
-- 1. Regular users to create channels for their own organization
-- 2. Super admins to create channels for any organization
CREATE POLICY "Organization members can create channels" 
ON public.channels 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) 
  AND (
    -- Super admins can create for any organization
    is_super_admin(auth.uid())
    OR 
    -- Regular users can only create for their organization
    (organization_id IN (
      SELECT profiles.organization_id
      FROM profiles
      WHERE profiles.user_id = auth.uid()
    ))
  )
);