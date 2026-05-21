-- Content seed assets: reference images uploaded by CMS team to inspire generations
CREATE TABLE public.creative_seed_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  label TEXT,
  tags TEXT[] DEFAULT '{}',
  brand_lockup TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_seed_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CMS editors can view seeds"
ON public.creative_seed_assets FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'cms_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "CMS editors can upload seeds"
ON public.creative_seed_assets FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'cms_editor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "CMS editors can update their seeds; admins any"
ON public.creative_seed_assets FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can delete seeds"
ON public.creative_seed_assets FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

-- Storage bucket for seed reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-seeds', 'creative-seeds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read creative-seeds"
ON storage.objects FOR SELECT
USING (bucket_id = 'creative-seeds');

CREATE POLICY "Authenticated upload creative-seeds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'creative-seeds' AND (
    public.has_role(auth.uid(), 'cms_editor') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner')
  )
);

CREATE POLICY "Authenticated update creative-seeds"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'creative-seeds' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    owner = auth.uid()
  )
);

CREATE POLICY "Authenticated delete creative-seeds"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'creative-seeds' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'owner') OR
    owner = auth.uid()
  )
);
