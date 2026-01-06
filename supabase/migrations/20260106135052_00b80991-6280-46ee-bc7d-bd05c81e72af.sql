
-- Add INSERT policy for lead_tags so all authenticated users can create tags for their organization
CREATE POLICY "Users can create tags for their organization" 
ON public.lead_tags 
FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
