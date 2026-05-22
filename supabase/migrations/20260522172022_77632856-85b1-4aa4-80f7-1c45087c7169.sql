
-- kennel_lookalike_scores: internal-only scoring output
CREATE TABLE IF NOT EXISTS public.kennel_lookalike_scores (
  email text PRIMARY KEY,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  scored_at timestamptz NOT NULL DEFAULT now(),
  model_version text NOT NULL DEFAULT 'lovable-gemini-v1'
);
CREATE INDEX IF NOT EXISTS idx_kennel_lookalike_scores_score ON public.kennel_lookalike_scores (score DESC);
CREATE INDEX IF NOT EXISTS idx_kennel_lookalike_scores_scored_at ON public.kennel_lookalike_scores (scored_at DESC);

ALTER TABLE public.kennel_lookalike_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kennel viewers can read lookalike scores"
ON public.kennel_lookalike_scores FOR SELECT TO authenticated
USING (public.can_view_kennel(auth.uid()));

-- writes via service role only (no policy needed for inserts/updates from edge functions)

-- kennel_audience_uploads: log of every audience push
CREATE TABLE IF NOT EXISTS public.kennel_audience_uploads (
  upload_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('google','meta','other')),
  list_name text NOT NULL,
  email_count integer NOT NULL DEFAULT 0,
  upload_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','partial')),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_kennel_audience_uploads_at ON public.kennel_audience_uploads (upload_at DESC);
CREATE INDEX IF NOT EXISTS idx_kennel_audience_uploads_platform ON public.kennel_audience_uploads (platform, upload_at DESC);

ALTER TABLE public.kennel_audience_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kennel viewers can read audience uploads"
ON public.kennel_audience_uploads FOR SELECT TO authenticated
USING (public.can_view_kennel(auth.uid()));

-- kennel_iab_segments: IAB taxonomy mapping
CREATE TABLE IF NOT EXISTS public.kennel_iab_segments (
  segment_id text PRIMARY KEY,
  segment_name text NOT NULL,
  tier integer NOT NULL CHECK (tier IN (1,2)),
  rdw_mapping text NOT NULL,
  platform_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kennel_iab_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read IAB segment map"
ON public.kennel_iab_segments FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Admins manage IAB segment map"
ON public.kennel_iab_segments FOR ALL TO authenticated
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_kennel_iab_segments_updated_at
BEFORE UPDATE ON public.kennel_iab_segments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed mappings
INSERT INTO public.kennel_iab_segments (segment_id, segment_name, tier, rdw_mapping, platform_ids) VALUES
  ('IAB19-6',  'Wine & Spirits', 1, 'wine_buyer',   '{}'::jsonb),
  ('IAB14-1',  'Pets',           1, 'dog_owner',    '{}'::jsonb),
  ('IAB14-2',  'Dogs',           2, 'dog_owner',    '{}'::jsonb),
  ('IAB20-3',  'Gift Giving',    2, 'gift_giver',   '{}'::jsonb),
  ('IAB9-30',  'Wine',           2, 'wine_buyer',   '{}'::jsonb),
  ('IAB6-6',   'Parenting',      1, 'gift_giver',   '{}'::jsonb)
ON CONFLICT (segment_id) DO NOTHING;
