CREATE OR REPLACE FUNCTION public.ab_results_timeseries(_since timestamptz DEFAULT now() - interval '30 days')
RETURNS TABLE(
  day date,
  site_variant text,
  sessions bigint,
  pageviews bigint,
  add_to_carts bigint,
  checkout_intents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(date_trunc('day', _since)::date, current_date, interval '1 day')::date AS day
  ),
  variants AS (
    SELECT unnest(ARRAY['lovable','legacy']) AS site_variant
  ),
  ev AS (
    SELECT
      date_trunc('day', created_at)::date AS day,
      site_variant,
      count(distinct session_id) FILTER (WHERE event_type = 'pageview') AS sessions,
      count(*) FILTER (WHERE event_type = 'pageview') AS pageviews,
      count(*) FILTER (WHERE event_type = 'add_to_cart') AS add_to_carts
    FROM ab_events
    WHERE created_at >= _since
    GROUP BY 1, 2
  ),
  ci AS (
    SELECT
      date_trunc('day', created_at)::date AS day,
      site_variant,
      count(distinct coalesce(cart_id, id::text)) AS checkout_intents
    FROM ab_checkout_intents
    WHERE created_at >= _since
    GROUP BY 1, 2
  )
  SELECT
    d.day,
    v.site_variant,
    coalesce(ev.sessions, 0)::bigint,
    coalesce(ev.pageviews, 0)::bigint,
    coalesce(ev.add_to_carts, 0)::bigint,
    coalesce(ci.checkout_intents, 0)::bigint
  FROM days d
  CROSS JOIN variants v
  LEFT JOIN ev ON ev.day = d.day AND ev.site_variant = v.site_variant
  LEFT JOIN ci ON ci.day = d.day AND ci.site_variant = v.site_variant
  ORDER BY d.day, v.site_variant;
$$;

GRANT EXECUTE ON FUNCTION public.ab_results_timeseries(timestamptz) TO authenticated, service_role;