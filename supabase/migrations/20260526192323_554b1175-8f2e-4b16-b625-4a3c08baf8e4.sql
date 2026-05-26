CREATE OR REPLACE FUNCTION public.ab_results_summary(_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
RETURNS TABLE(site_variant text, sessions bigint, pageviews bigint, add_to_carts bigint, checkout_intents bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with v as (
    select unnest(array['lovable','legacy']) as site_variant
  ),
  ev as (
    select site_variant,
           count(distinct session_id) filter (where session_id is not null) as sessions,
           count(*) filter (where event_type = 'pageview') as pageviews,
           count(*) filter (where event_type = 'add_to_cart') as add_to_carts
    from public.ab_events
    where created_at >= _since
    group by site_variant
  ),
  ci as (
    -- Dedup repeat Checkout clicks within the same cart so the count
    -- represents distinct intent events, not button mashes.
    select site_variant,
           count(distinct coalesce(cart_id, id::text)) as checkout_intents
    from public.ab_checkout_intents
    where created_at >= _since
    group by site_variant
  )
  select v.site_variant,
         coalesce(ev.sessions, 0),
         coalesce(ev.pageviews, 0),
         coalesce(ev.add_to_carts, 0),
         coalesce(ci.checkout_intents, 0)
  from v
  left join ev on ev.site_variant = v.site_variant
  left join ci on ci.site_variant = v.site_variant
  order by v.site_variant;
$function$;