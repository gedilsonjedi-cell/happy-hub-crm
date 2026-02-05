
-- Allow organization members to view all profiles in their organization
-- This is critical for admins to manage their team

-- Add policy for users to view all profiles in their organization
CREATE POLICY "Organization members can view organization profiles"
ON public.profiles
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
);
