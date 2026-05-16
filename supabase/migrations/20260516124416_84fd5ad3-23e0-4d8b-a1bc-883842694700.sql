
-- Public bucket for ambassador profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('ambassador-avatars', 'ambassador-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view ambassador avatars
CREATE POLICY "Ambassador avatars are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'ambassador-avatars');

-- Authenticated users can upload to their own folder (path prefixed with user id)
CREATE POLICY "Users can upload their own ambassador avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ambassador-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own ambassador avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ambassador-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own ambassador avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ambassador-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
