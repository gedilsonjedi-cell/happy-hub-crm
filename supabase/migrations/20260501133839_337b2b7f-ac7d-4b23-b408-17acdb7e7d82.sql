-- Add header_media_url to message_templates for IMAGE/VIDEO/DOCUMENT header overrides
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS header_media_url text;

-- Public bucket for template header media (images/videos/docs sent as Meta template headers)
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-media', 'template-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies on storage.objects for template-media
DROP POLICY IF EXISTS "Public read template-media" ON storage.objects;
CREATE POLICY "Public read template-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'template-media');

DROP POLICY IF EXISTS "Org members upload template-media" ON storage.objects;
CREATE POLICY "Org members upload template-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'template-media');

DROP POLICY IF EXISTS "Org members update template-media" ON storage.objects;
CREATE POLICY "Org members update template-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'template-media');

DROP POLICY IF EXISTS "Org members delete template-media" ON storage.objects;
CREATE POLICY "Org members delete template-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'template-media');