
-- Creative Studio: jobs + outputs

CREATE TABLE public.creative_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  source_filename TEXT,
  brand_lockup TEXT NOT NULL DEFAULT 'wine' CHECK (brand_lockup IN ('wine','merch')),
  destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view creative jobs"
  ON public.creative_jobs FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can insert creative jobs"
  ON public.creative_jobs FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "Ad ops can update creative jobs"
  ON public.creative_jobs FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can delete creative jobs"
  ON public.creative_jobs FOR DELETE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER update_creative_jobs_updated_at
  BEFORE UPDATE ON public.creative_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_creative_jobs_user ON public.creative_jobs (user_id, created_at DESC);

-- Outputs
CREATE TABLE public.creative_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.creative_jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','copy')),
  platform TEXT,
  ratio TEXT,
  url TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.creative_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view creative outputs"
  ON public.creative_outputs FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can insert creative outputs"
  ON public.creative_outputs FOR INSERT
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can update creative outputs"
  ON public.creative_outputs FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can delete creative outputs"
  ON public.creative_outputs FOR DELETE
  USING (public.is_ad_ops(auth.uid()));

CREATE TRIGGER update_creative_outputs_updated_at
  BEFORE UPDATE ON public.creative_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_creative_outputs_job ON public.creative_outputs (job_id, kind);

-- Storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('creative-studio', 'creative-studio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read creative studio assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'creative-studio');

CREATE POLICY "Ad ops can upload creative studio assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'creative-studio' AND public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can update creative studio assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'creative-studio' AND public.is_ad_ops(auth.uid()));

CREATE POLICY "Ad ops can delete creative studio assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'creative-studio' AND public.is_ad_ops(auth.uid()));
