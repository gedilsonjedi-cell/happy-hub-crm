-- Drop the existing restrictive ALL policy
DROP POLICY IF EXISTS "Admins can manage custom field definitions" ON public.lead_custom_field_definitions;

-- Create separate policies for better granularity
-- Allow all organization members to INSERT custom fields
CREATE POLICY "Organization members can insert custom field definitions"
  ON public.lead_custom_field_definitions
  FOR INSERT
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));

-- Allow admins/supervisors to UPDATE custom fields
CREATE POLICY "Admins can update custom field definitions"
  ON public.lead_custom_field_definitions
  FOR UPDATE
  USING (
    organization_id = get_user_organization_id(auth.uid()) 
    AND is_admin_or_supervisor(auth.uid())
  );

-- Allow admins/supervisors to DELETE custom fields
CREATE POLICY "Admins can delete custom field definitions"
  ON public.lead_custom_field_definitions
  FOR DELETE
  USING (
    organization_id = get_user_organization_id(auth.uid()) 
    AND is_admin_or_supervisor(auth.uid())
  );

-- Add super admin policy for all operations
CREATE POLICY "Super admins can manage custom field definitions"
  ON public.lead_custom_field_definitions
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));