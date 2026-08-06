DROP POLICY IF EXISTS "Super admins can manage business hours" ON public.business_hours;
CREATE POLICY "Super admins can manage business hours"
ON public.business_hours
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can manage away message" ON public.away_message_config;
CREATE POLICY "Super admins can manage away message"
ON public.away_message_config
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can manage welcome message" ON public.welcome_message_config;
CREATE POLICY "Super admins can manage welcome message"
ON public.welcome_message_config
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));