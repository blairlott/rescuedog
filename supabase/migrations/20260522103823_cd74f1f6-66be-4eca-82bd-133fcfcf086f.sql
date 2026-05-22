
CREATE OR REPLACE FUNCTION public.wine_club_conversion_triggers()
RETURNS TABLE(
  total_guests bigint,
  converters bigint,
  baseline_rate numeric,
  -- Tasting/event touchpoint
  tasting_touched bigint,
  tasting_converters bigint,
  tasting_rate numeric,
  -- Welcome email reached step >= 3 before joining (for converters)
  -- or step >= 3 ever (for non-converters)
  welcome_3plus_touched bigint,
  welcome_3plus_converters bigint,
  welcome_3plus_rate numeric,
  -- Wine club page views in 14d before join (converters) or ever (non-converters)
  wine_club_page_touched bigint,
  wine_club_page_converters bigint,
  wine_club_page_rate numeric,
  -- Bottle-count gateway: bought 2+ bottles in a single guest order
  multi_bottle_touched bigint,
  multi_bottle_converters bigint,
  multi_bottle_rate numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_kennel(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  WITH per_email AS (
    SELECT
      lower(trim(t.customer_email))                                        AS email,
      MIN(t.transaction_date) FILTER (WHERE upper(t.order_type) <> 'WINE_CLUB') AS first_guest_at,
      MIN(t.transaction_date) FILTER (WHERE upper(t.order_type)  = 'WINE_CLUB') AS first_club_at,
      MAX(CASE
            WHEN upper(t.order_type) IN ('POS','EVENT')
              OR lower(coalesce(t.sale_location,'')) ~ '(tasting|event|winery)'
            THEN 1 ELSE 0
          END) FILTER (WHERE upper(t.order_type) <> 'WINE_CLUB') AS guest_had_tasting_raw,
      MAX(CASE WHEN coalesce(t.bottles,0) >= 2 THEN 1 ELSE 0 END)
        FILTER (WHERE upper(t.order_type) <> 'WINE_CLUB')        AS guest_had_multi_bottle
    FROM public.vs_transactions t
    WHERE t.customer_email IS NOT NULL
      AND t.transaction_date IS NOT NULL
    GROUP BY 1
  ),
  guests AS (
    -- Only emails that had at least one guest order
    SELECT
      email,
      first_guest_at,
      first_club_at,
      (first_club_at IS NOT NULL AND first_club_at > first_guest_at) AS is_converter,
      -- Tasting touchpoint MUST predate the club join for converters
      CASE
        WHEN guest_had_tasting_raw = 1 AND (first_club_at IS NULL OR EXISTS (
          SELECT 1 FROM public.vs_transactions t2
          WHERE lower(trim(t2.customer_email)) = email
            AND (upper(t2.order_type) IN ('POS','EVENT')
                 OR lower(coalesce(t2.sale_location,'')) ~ '(tasting|event|winery)')
            AND upper(t2.order_type) <> 'WINE_CLUB'
            AND t2.transaction_date < first_club_at
        )) THEN true ELSE false
      END AS had_tasting_pre,
      guest_had_multi_bottle = 1 AS had_multi_bottle
    FROM per_email
    WHERE first_guest_at IS NOT NULL
  ),
  with_profile AS (
    SELECT g.*, p.id AS user_id
    FROM guests g
    LEFT JOIN public.profiles p ON lower(trim(p.email)) = g.email
  ),
  welcome AS (
    SELECT
      lower(trim(w.email)) AS email,
      MAX(w.step_index) FILTER (WHERE w.status = 'sent') AS max_sent_step,
      MAX(w.sent_at)     FILTER (WHERE w.status = 'sent') AS last_sent_at
    FROM public.welcome_email_schedule w
    WHERE w.email IS NOT NULL
    GROUP BY 1
  ),
  site_views AS (
    SELECT
      s.user_id,
      COUNT(*) FILTER (WHERE s.event_type = 'pageview') AS wine_club_views
    FROM public.site_intel_events s
    WHERE s.path ILIKE '%wine-club%' OR s.path ILIKE '%/club%'
    GROUP BY 1
  ),
  enriched AS (
    SELECT
      wp.email,
      wp.is_converter,
      wp.had_tasting_pre,
      wp.had_multi_bottle,
      wp.first_club_at,
      -- Welcome step >= 3 must have been sent BEFORE join (for converters)
      CASE
        WHEN wp.is_converter
          THEN (we.max_sent_step >= 3 AND we.last_sent_at IS NOT NULL
                AND we.last_sent_at < (wp.first_club_at + interval '1 day'))
        ELSE coalesce(we.max_sent_step,0) >= 3
      END AS had_welcome_3plus,
      coalesce(sv.wine_club_views,0) > 0 AS had_wine_club_view
    FROM with_profile wp
    LEFT JOIN welcome   we ON we.email   = wp.email
    LEFT JOIN site_views sv ON sv.user_id = wp.user_id
  )
  SELECT
    COUNT(*)::bigint                                       AS total_guests,
    COUNT(*) FILTER (WHERE is_converter)::bigint           AS converters,
    ROUND(
      AVG(CASE WHEN is_converter THEN 1.0 ELSE 0.0 END)::numeric, 4
    )                                                      AS baseline_rate,

    COUNT(*) FILTER (WHERE had_tasting_pre)::bigint        AS tasting_touched,
    COUNT(*) FILTER (WHERE had_tasting_pre AND is_converter)::bigint
                                                           AS tasting_converters,
    ROUND(COALESCE(AVG(CASE WHEN had_tasting_pre THEN (CASE WHEN is_converter THEN 1.0 ELSE 0.0 END) END), 0)::numeric, 4)
                                                           AS tasting_rate,

    COUNT(*) FILTER (WHERE had_welcome_3plus)::bigint      AS welcome_3plus_touched,
    COUNT(*) FILTER (WHERE had_welcome_3plus AND is_converter)::bigint
                                                           AS welcome_3plus_converters,
    ROUND(COALESCE(AVG(CASE WHEN had_welcome_3plus THEN (CASE WHEN is_converter THEN 1.0 ELSE 0.0 END) END), 0)::numeric, 4)
                                                           AS welcome_3plus_rate,

    COUNT(*) FILTER (WHERE had_wine_club_view)::bigint     AS wine_club_page_touched,
    COUNT(*) FILTER (WHERE had_wine_club_view AND is_converter)::bigint
                                                           AS wine_club_page_converters,
    ROUND(COALESCE(AVG(CASE WHEN had_wine_club_view THEN (CASE WHEN is_converter THEN 1.0 ELSE 0.0 END) END), 0)::numeric, 4)
                                                           AS wine_club_page_rate,

    COUNT(*) FILTER (WHERE had_multi_bottle)::bigint       AS multi_bottle_touched,
    COUNT(*) FILTER (WHERE had_multi_bottle AND is_converter)::bigint
                                                           AS multi_bottle_converters,
    ROUND(COALESCE(AVG(CASE WHEN had_multi_bottle THEN (CASE WHEN is_converter THEN 1.0 ELSE 0.0 END) END), 0)::numeric, 4)
                                                           AS multi_bottle_rate
  FROM enriched;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wine_club_conversion_triggers() TO authenticated;
