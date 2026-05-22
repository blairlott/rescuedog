
CREATE OR REPLACE FUNCTION public.finance_spend_by_platform(_start date, _end date)
 RETURNS TABLE(platform text, spend_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;

  RETURN QUERY
  WITH facts AS (
    SELECT
      CASE lower(coalesce(f.platform,''))
        WHEN 'meta' THEN 'Meta'
        WHEN 'facebook' THEN 'Meta'
        WHEN 'google' THEN 'Google'
        WHEN 'google_ads' THEN 'Google'
        WHEN 'instacart' THEN 'Instacart'
        WHEN 'instacart_ads' THEN 'Instacart'
        WHEN '' THEN 'Other'
        ELSE initcap(f.platform)
      END AS platform,
      ROUND(COALESCE(SUM(f.spend),0) * 100)::bigint AS spend_cents
    FROM public.ad_performance_facts f
    WHERE f.date BETWEEN _start AND _end
    GROUP BY 1
  ),
  entries AS (
    SELECT
      CASE
        WHEN e.subcategory = 'meta_ads' THEN 'Meta'
        WHEN e.subcategory = 'google_ads' THEN 'Google'
        WHEN e.subcategory = 'instacart_ads' THEN 'Instacart'
        ELSE COALESCE(e.subcategory, e.category, 'Other')
      END AS platform,
      COALESCE(SUM(e.amount_cents),0)::bigint AS spend_cents
    FROM public.bm_finance_entries e
    WHERE e.date BETWEEN _start AND _end
      AND e.entry_type = 'expense'
      AND (lower(coalesce(e.category,'')) ~ '(ad|advert|marketing)'
           OR e.subcategory IN ('meta_ads','google_ads','instacart_ads'))
    GROUP BY 1
  ),
  combined AS (
    SELECT platform, spend_cents FROM facts WHERE spend_cents > 0
    UNION ALL
    SELECT platform, spend_cents FROM entries WHERE spend_cents > 0
  )
  SELECT platform, SUM(spend_cents)::bigint
  FROM combined
  GROUP BY platform
  ORDER BY 2 DESC;
END $function$;
