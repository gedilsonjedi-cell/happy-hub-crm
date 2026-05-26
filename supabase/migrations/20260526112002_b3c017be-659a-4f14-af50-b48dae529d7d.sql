
-- whatsapp-media: scope INSERT to the user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload media" ON storage.objects;
CREATE POLICY "Authenticated users can upload media to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- template-media: scope mutations to the caller's organization
DROP POLICY IF EXISTS "Org members upload template-media" ON storage.objects;
DROP POLICY IF EXISTS "Org members update template-media" ON storage.objects;
DROP POLICY IF EXISTS "Org members delete template-media" ON storage.objects;

CREATE POLICY "Org members upload template-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'template-media'
  AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
);

CREATE POLICY "Org members update template-media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'template-media'
  AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
)
WITH CHECK (
  bucket_id = 'template-media'
  AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
);

CREATE POLICY "Org members delete template-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'template-media'
  AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
);
