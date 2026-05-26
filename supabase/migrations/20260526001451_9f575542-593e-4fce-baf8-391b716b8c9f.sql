CREATE OR REPLACE FUNCTION public.get_hero_variant_stats(_days int DEFAULT 30)
RETURNS TABLE (
  variant_id text,
  impressions bigint,
  clicks bigint,
  orders bigint,
  revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    variant_id,
    COUNT(*) FILTER (WHERE event_type = 'impression')::bigint AS impressions,
    COUNT(*) FILTER (WHERE event_type = 'click')::bigint      AS clicks,
    COUNT(*) FILTER (WHERE event_type = 'order')::bigint      AS orders,
    COALESCE(SUM(order_value) FILTER (WHERE event_type = 'order'), 0)::numeric AS revenue
  FROM public.hero_events
  WHERE created_at >= now() - (_days || ' days')::interval
  GROUP BY variant_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_hero_variant_stats(int) TO anon, authenticated;