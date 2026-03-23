-- Add super admin policies for redirect_links
CREATE POLICY "Super admins can manage redirect links"
ON public.redirect_links
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));