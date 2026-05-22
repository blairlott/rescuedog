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
      END AS plat,
      ROUND(COALESCE(SUM(f.spend),0) * 100)::bigint AS spend_c
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
        WHEN lower(coalesce(e.account_name,'')) ~ '(facebook|meta)' THEN 'Meta'
        WHEN lower(coalesce(e.account_name,'')) ~ '(google|youtube|adwords)' THEN 'Google'
        WHEN lower(coalesce(e.account_name,'')) ~ 'instacart' THEN 'Instacart'
        WHEN lower(coalesce(e.account_name,'')) ~ 'tiktok' THEN 'TikTok'
        WHEN lower(coalesce(e.account_name,'')) ~ 'affiliate' THEN 'Affiliate'
        WHEN lower(coalesce(e.account_name,'')) ~ 'email' THEN 'Email'
        WHEN lower(coalesce(e.account_name,'')) ~ '(website|seo)' THEN 'Website'
        WHEN lower(coalesce(e.account_name,'')) ~ 'social' THEN 'Social Media'
        WHEN lower(coalesce(e.account_name,'')) ~ '(ad|advert|marketing)' THEN COALESCE(NULLIF(initcap(e.account_name),''),'Other Ads')
        ELSE NULL
      END AS plat,
      COALESCE(SUM(e.amount_cents),0)::bigint AS spend_c
    FROM public.bm_finance_entries e
    WHERE e.date BETWEEN _start AND _end
      AND e.entry_type = 'expense'
    GROUP BY 1
  ),
  combined AS (
    SELECT plat, spend_c FROM facts WHERE spend_c > 0 AND plat IS NOT NULL
    UNION ALL
    SELECT plat, spend_c FROM entries WHERE spend_c > 0 AND plat IS NOT NULL
  )
  SELECT c.plat::text, SUM(c.spend_c)::bigint
  FROM combined c
  GROUP BY c.plat
  ORDER BY 2 DESC;
END $function$;