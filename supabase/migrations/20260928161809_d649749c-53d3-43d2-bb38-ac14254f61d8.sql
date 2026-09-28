ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS avatar_updated_by uuid;

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id::text FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.current_profile_org_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO authenticated, service_role;

CREATE POLICY "contact_avatars_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = public.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = public.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = public.current_profile_org_id() OR public.is_super_admin(auth.uid())))
WITH CHECK (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = public.current_profile_org_id() OR public.is_super_admin(auth.uid())));
CREATE POLICY "contact_avatars_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contact-avatars' AND ((storage.foldername(name))[1] = public.current_profile_org_id() OR public.is_super_admin(auth.uid())));