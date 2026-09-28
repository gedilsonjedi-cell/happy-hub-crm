CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.current_profile_org_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;
REVOKE ALL ON FUNCTION app_private.current_profile_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.current_profile_org_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "contact_avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "contact_avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "contact_avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "contact_avatars_delete" ON storage.objects;

CREATE POLICY "contact_avatars_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = app_private.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = app_private.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = app_private.current_profile_org_id() OR public.is_super_admin(auth.uid())))
WITH CHECK (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = app_private.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = app_private.current_profile_org_id() OR public.is_super_admin(auth.uid())));

DROP FUNCTION IF EXISTS public.current_profile_org_id();