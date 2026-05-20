
-- Media library table
CREATE TABLE public.media_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','copy')),
  mime_type TEXT,
  file_path TEXT,
  file_url TEXT,
  file_size BIGINT,
  copy_body TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  alt_text TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_library_kind ON public.media_library(kind);
CREATE INDEX idx_media_library_status ON public.media_library(status);
CREATE INDEX idx_media_library_tags ON public.media_library USING GIN(tags);
CREATE INDEX idx_media_library_created_at ON public.media_library(created_at DESC);

ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published media is viewable by everyone"
ON public.media_library FOR SELECT
USING (status = 'published' OR public.is_cms_editor(auth.uid()));

CREATE POLICY "CMS editors can insert media"
ON public.media_library FOR INSERT
WITH CHECK (public.is_cms_editor(auth.uid()));

CREATE POLICY "CMS editors can update media"
ON public.media_library FOR UPDATE
USING (public.is_cms_editor(auth.uid()));

CREATE POLICY "CMS editors can delete media"
ON public.media_library FOR DELETE
USING (public.is_cms_editor(auth.uid()));

CREATE TRIGGER trg_media_library_updated_at
BEFORE UPDATE ON public.media_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-library', 'media-library', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Media library is publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'media-library');

CREATE POLICY "CMS editors can upload media-library files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media-library' AND public.is_cms_editor(auth.uid()));

CREATE POLICY "CMS editors can update media-library files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'media-library' AND public.is_cms_editor(auth.uid()));

CREATE POLICY "CMS editors can delete media-library files"
ON storage.objects FOR DELETE
USING (bucket_id = 'media-library' AND public.is_cms_editor(auth.uid()));
