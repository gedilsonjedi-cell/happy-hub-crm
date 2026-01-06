-- Drop old user-based RLS policies for campaigns
DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can create their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;

-- Create new organization-based RLS policies for campaigns
CREATE POLICY "Organization members can view campaigns" 
ON public.campaigns 
FOR SELECT 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can insert campaigns" 
ON public.campaigns 
FOR INSERT 
TO authenticated
WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can update campaigns" 
ON public.campaigns 
FOR UPDATE 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can delete campaigns" 
ON public.campaigns 
FOR DELETE 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);