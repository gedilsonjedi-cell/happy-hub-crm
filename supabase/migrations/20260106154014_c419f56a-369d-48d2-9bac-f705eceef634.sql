-- Drop old RLS policies for message_templates
DROP POLICY IF EXISTS "Users can view their own templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can create their own templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON public.message_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON public.message_templates;
DROP POLICY IF EXISTS "Super admins can view all templates" ON public.message_templates;

-- Create new organization-based RLS policies
CREATE POLICY "Organization members can view templates" 
ON public.message_templates 
FOR SELECT 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can create templates" 
ON public.message_templates 
FOR INSERT 
TO authenticated
WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  OR (organization_id IS NULL AND auth.uid() = user_id)
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can update templates" 
ON public.message_templates 
FOR UPDATE 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can delete templates" 
ON public.message_templates 
FOR DELETE 
TO authenticated
USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);