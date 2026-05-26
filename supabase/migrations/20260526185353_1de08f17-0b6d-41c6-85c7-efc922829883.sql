
CREATE OR REPLACE FUNCTION public.get_slot_variant_scores(
  _slot_key text,
  _segment_bucket text DEFAULT 'all'
)
RETURNS TABLE (
  variant_key text,
  score double precision,
  exposures bigint,
  revenue_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH exp AS (
    SELECT id FROM public.experiments
     WHERE slot_key = _slot_key AND status = 'running'
     ORDER BY created_at DESC
     LIMIT 1
  ),
  seg AS (
    SELECT v.key AS variant_key,
           COALESCE(s.decayed_reward, 0)::double precision    AS dr,
           COALESCE(s.decayed_exposures, 0)::double precision AS de,
           COALESCE(s.exposures, 0)::bigint                   AS exposures,
           COALESCE(s.revenue_cents, 0)::bigint               AS revenue_cents
      FROM public.experiment_variants v
      JOIN exp e ON e.id = v.experiment_id
      LEFT JOIN public.experiment_variant_segment_stats s
        ON s.variant_id = v.id AND s.segment_bucket = _segment_bucket
  ),
  agg AS (
    SELECT v.key AS variant_key,
           COALESCE(SUM(s.decayed_reward), 0)::double precision    AS dr_all,
           COALESCE(SUM(s.decayed_exposures), 0)::double precision AS de_all
      FROM public.experiment_variants v
      JOIN exp e ON e.id = v.experiment_id
      LEFT JOIN public.experiment_variant_segment_stats s
        ON s.variant_id = v.id
     GROUP BY v.key
  )
  SELECT seg.variant_key,
         -- Beta/Gamma smoothed mean: per-segment if it has volume, else pooled
         CASE
           WHEN seg.de >= 30 THEN (seg.dr + 1.0) / (seg.de + 4.0)
           WHEN agg.de_all >= 1 THEN (agg.dr_all + 1.0) / (agg.de_all + 4.0)
           ELSE 0.25
         END AS score,
         seg.exposures,
         seg.revenue_cents
    FROM seg
    JOIN agg USING (variant_key);
$$;

GRANT EXECUTE ON FUNCTION public.get_slot_variant_scores(text, text) TO anon, authenticated, service_role;
