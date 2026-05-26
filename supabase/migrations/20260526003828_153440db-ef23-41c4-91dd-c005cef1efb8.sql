-- Hero variants table
CREATE TABLE public.hero_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL CHECK (surface IN ('wine','merch')),
  image_url text NOT NULL,
  image_alt text NOT NULL DEFAULT '',
  eyebrow text NOT NULL DEFAULT '',
  headline_html text NOT NULL DEFAULT '',
  sub text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'Shop Now',
  cta_href text NOT NULL DEFAULT '/wines',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  sticky boolean NOT NULL DEFAULT false,
  auto_generated boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hero_variants_surface_status ON public.hero_variants(surface, status);

ALTER TABLE public.hero_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active hero variants are public"
ON public.hero_variants FOR SELECT
USING (status = 'active' OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owner/admin can insert hero variants"
ON public.hero_variants FOR INSERT
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owner/admin can update hero variants"
ON public.hero_variants FOR UPDATE
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owner/admin can delete hero variants"
ON public.hero_variants FOR DELETE
USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_hero_variants_updated_at
BEFORE UPDATE ON public.hero_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public RPC: active variants for a surface
CREATE OR REPLACE FUNCTION public.get_active_hero_variants(_surface text)
RETURNS SETOF public.hero_variants
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.hero_variants
  WHERE surface = _surface AND status = 'active'
  ORDER BY sticky DESC, created_at DESC;
$$;

-- Owner/admin/service: auto-tune (mark winners sticky, retire losers based on hero_events)
CREATE OR REPLACE FUNCTION public.auto_tune_hero_variants(_min_impressions integer DEFAULT 1000, _days integer DEFAULT 30)
RETURNS TABLE(action text, variant_id uuid, impressions bigint, ctr numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _median numeric;
  _p75 numeric;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  CREATE TEMP TABLE _stats ON COMMIT DROP AS
  SELECT v.id,
         v.sticky,
         v.status,
         COALESCE(s.impressions, 0)::bigint AS impressions,
         COALESCE(s.clicks, 0)::bigint AS clicks,
         CASE WHEN COALESCE(s.impressions,0) > 0
              THEN (COALESCE(s.clicks,0)::numeric / s.impressions::numeric)
              ELSE 0 END AS ctr
  FROM public.hero_variants v
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE event_type='impression') AS impressions,
      COUNT(*) FILTER (WHERE event_type='click')      AS clicks
    FROM public.hero_events e
    WHERE e.variant_id = v.id::text
      AND e.created_at >= now() - (_days || ' days')::interval
  ) s ON true;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ctr),
         percentile_cont(0.75) WITHIN GROUP (ORDER BY ctr)
    INTO _median, _p75
  FROM _stats WHERE impressions >= _min_impressions;

  -- Winners → sticky
  RETURN QUERY
  WITH upd AS (
    UPDATE public.hero_variants v
       SET sticky = true, updated_at = now()
      FROM _stats s
     WHERE v.id = s.id
       AND s.impressions >= _min_impressions
       AND _p75 IS NOT NULL
       AND s.ctr >= _p75
       AND v.sticky = false
     RETURNING v.id, s.impressions, s.ctr
  )
  SELECT 'sticky'::text, id, impressions, ctr FROM upd;

  -- Losers → retired (skip sticky)
  RETURN QUERY
  WITH upd AS (
    UPDATE public.hero_variants v
       SET status = 'retired', updated_at = now()
      FROM _stats s
     WHERE v.id = s.id
       AND s.impressions >= _min_impressions
       AND _median IS NOT NULL
       AND s.ctr < (_median * 0.6)
       AND v.sticky = false
       AND v.status = 'active'
     RETURNING v.id, s.impressions, s.ctr
  )
  SELECT 'retired'::text, id, impressions, ctr FROM upd;
END;
$$;

-- Storage bucket for hero images
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-images', 'hero-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Hero images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'hero-images');

CREATE POLICY "Owner/admin upload hero images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'hero-images' AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owner/admin update hero images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'hero-images' AND public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Owner/admin delete hero images"
ON storage.objects FOR DELETE
USING (bucket_id = 'hero-images' AND public.is_admin_or_owner(auth.uid()));