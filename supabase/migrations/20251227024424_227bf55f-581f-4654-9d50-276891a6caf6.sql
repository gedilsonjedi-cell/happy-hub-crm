-- Create storage bucket for WhatsApp media
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'whatsapp-media' 
  AND auth.role() = 'authenticated'
);

-- Allow public access to view media (for WhatsApp to fetch)
CREATE POLICY "Public can view whatsapp media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'whatsapp-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);