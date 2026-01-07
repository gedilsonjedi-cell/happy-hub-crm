-- Drop old user-centric policies and replace with organization-centric ones
DROP POLICY IF EXISTS "Users can view their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can create their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete their own leads" ON public.leads;

-- Create organization-based policies for leads
CREATE POLICY "Organization members can view leads"
ON public.leads
FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can create leads"
ON public.leads
FOR INSERT
WITH CHECK (
  (organization_id = get_user_organization_id(auth.uid()) AND auth.uid() = user_id)
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can update leads"
ON public.leads
FOR UPDATE
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can delete leads"
ON public.leads
FOR DELETE
USING (
  (organization_id = get_user_organization_id(auth.uid()) AND is_admin_or_supervisor(auth.uid()))
  OR is_super_admin(auth.uid())
);