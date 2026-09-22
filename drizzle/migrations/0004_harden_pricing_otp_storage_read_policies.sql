DROP POLICY IF EXISTS "otp_settings_read_authenticated" ON public.otp_settings;

CREATE POLICY "otp_settings_read_admins"
ON public.otp_settings
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'allan.pedro147@gmail.com'
);

CREATE OR REPLACE FUNCTION public.otp_login_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT s.otp_login_enabled FROM public.otp_settings s WHERE s.id = true), false);
$$;

REVOKE ALL ON FUNCTION public.otp_login_enabled() FROM public;
GRANT EXECUTE ON FUNCTION public.otp_login_enabled() TO authenticated;

DROP POLICY IF EXISTS "Everyone can view pricing" ON public.dispatch_pricing;
CREATE POLICY "Authenticated users can view dispatch pricing"
ON public.dispatch_pricing
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE SELECT ON public.dispatch_pricing FROM anon;

DROP POLICY IF EXISTS "Everyone can view subscription pricing" ON public.subscription_pricing;
CREATE POLICY "Authenticated users can view subscription pricing"
ON public.subscription_pricing
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE SELECT ON public.subscription_pricing FROM anon;

DROP POLICY IF EXISTS "Public can view whatsapp media" ON storage.objects;
CREATE POLICY "Authenticated can view whatsapp media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');

DROP POLICY IF EXISTS "Public read template-media" ON storage.objects;
CREATE POLICY "Authenticated can read template-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'template-media');