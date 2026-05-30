-- =========================================================
-- PART 2.12 — hero_variants schema extension for video variants
-- =========================================================
ALTER TABLE public.hero_variants
  ADD COLUMN IF NOT EXISTS variant_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_url    text,
  ADD COLUMN IF NOT EXISTS weight       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS variant_key  text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hero_variants_variant_type_check'
  ) THEN
    ALTER TABLE public.hero_variants
      ADD CONSTRAINT hero_variants_variant_type_check
      CHECK (variant_type IN ('image','video'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS hero_variants_variant_key_uniq
  ON public.hero_variants (variant_key) WHERE variant_key IS NOT NULL;

-- Seed: brand video variant on the existing `wine` surface
INSERT INTO public.hero_variants (
  surface, variant_type, variant_key, image_url, image_alt,
  video_url, eyebrow, headline_html, sub, cta_label, cta_href,
  status, sticky, weight, auto_generated
)
SELECT
  'wine', 'video', 'home-brand-video',
  '/src/assets/hero/brand-video-poster.jpg',
  'Rescue Dog Wines brand film — winery, rescues, and the dogs we fund',
  'https://www.youtube.com/embed/rNxSRJpqz_w?autoplay=1&mute=1&loop=1&playlist=rNxSRJpqz_w&controls=0&modestbranding=1&playsinline=1&rel=0',
  'Lodi Cabernet · 50% of profits to rescue',
  'Pour for<br/>the pack.',
  'Award-winning, sustainably grown Lodi wines. Every bottle helps a rescue dog find a forever home.',
  'Shop Wines', '/wines',
  'active', false, 1, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.hero_variants WHERE variant_key = 'home-brand-video'
);

-- =========================================================
-- PART 2.14 — donation_metrics
-- =========================================================
CREATE TABLE IF NOT EXISTS public.donation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL UNIQUE,
  value_cents bigint,
  value_display text NOT NULL,
  partner_count integer,
  partner_count_override integer,
  as_of timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'fallback' CHECK (source IN ('quickbooks','manual','fallback')),
  qb_account_id text,
  qb_account_name text,
  error_log text,
  last_successful_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.donation_metrics TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.donation_metrics TO authenticated;
GRANT ALL ON public.donation_metrics TO service_role;

ALTER TABLE public.donation_metrics ENABLE ROW LEVEL SECURITY;

-- Public can read minimal display fields (the page just renders value_display + partner_count).
-- Sensitive columns (qb_account_id, qb_account_name, error_log, value_cents) MUST be filtered
-- in the public-facing SELECT path. We expose a security-definer function for the public read,
-- and restrict raw-row SELECT to admin/owner.
CREATE POLICY "Admin/owner read all donation_metrics"
ON public.donation_metrics FOR SELECT
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admin/owner write donation_metrics"
ON public.donation_metrics FOR ALL
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Public read function — returns only the safe display fields
CREATE OR REPLACE FUNCTION public.get_donation_metric_public(_metric_key text)
RETURNS TABLE (
  metric_key text,
  value_display text,
  partner_count integer,
  as_of timestamptz,
  source text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    metric_key,
    value_display,
    COALESCE(partner_count_override, partner_count) AS partner_count,
    as_of,
    source
  FROM public.donation_metrics
  WHERE metric_key = _metric_key
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_donation_metric_public(text) TO anon, authenticated;

CREATE TRIGGER trg_donation_metrics_updated_at
BEFORE UPDATE ON public.donation_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fallback seed
INSERT INTO public.donation_metrics (
  metric_key, value_cents, value_display, partner_count,
  source, as_of
) VALUES (
  'lifetime_donations', 17000000, '$170,000+', 150,
  'fallback', now()
) ON CONFLICT (metric_key) DO NOTHING;