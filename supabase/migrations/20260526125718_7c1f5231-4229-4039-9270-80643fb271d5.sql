
DROP POLICY IF EXISTS "Org members upload template-media" ON storage.objects;
DROP POLICY IF EXISTS "Org members update template-media" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete template-media" ON storage.objects;

CREATE POLICY "Org or super admin upload template-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'template-media' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  )
);

CREATE POLICY "Org or super admin update template-media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'template-media' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  )
)
WITH CHECK (
  bucket_id = 'template-media' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  )
);

CREATE POLICY "Org or super admin delete template-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'template-media' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (public.get_user_organization_id(auth.uid()))::text
  )
);
