-- Drop old RLS policies for channel_templates
DROP POLICY IF EXISTS "Users can view their channel templates" ON public.channel_templates;
DROP POLICY IF EXISTS "Users can manage their channel templates" ON public.channel_templates;
DROP POLICY IF EXISTS "Users can delete their channel templates" ON public.channel_templates;

-- Create new organization-based RLS policies for channel_templates
CREATE POLICY "Organization members can view channel templates" 
ON public.channel_templates 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channels 
    WHERE channels.id = channel_templates.channel_id 
    AND (
      channels.organization_id = get_user_organization_id(auth.uid())
      OR is_super_admin(auth.uid())
    )
  )
);

CREATE POLICY "Organization members can insert channel templates" 
ON public.channel_templates 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels 
    WHERE channels.id = channel_templates.channel_id 
    AND (
      channels.organization_id = get_user_organization_id(auth.uid())
      OR is_super_admin(auth.uid())
    )
  )
);

CREATE POLICY "Organization members can update channel templates" 
ON public.channel_templates 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channels 
    WHERE channels.id = channel_templates.channel_id 
    AND (
      channels.organization_id = get_user_organization_id(auth.uid())
      OR is_super_admin(auth.uid())
    )
  )
);

CREATE POLICY "Organization members can delete channel templates" 
ON public.channel_templates 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM channels 
    WHERE channels.id = channel_templates.channel_id 
    AND (
      channels.organization_id = get_user_organization_id(auth.uid())
      OR is_super_admin(auth.uid())
    )
  )
);