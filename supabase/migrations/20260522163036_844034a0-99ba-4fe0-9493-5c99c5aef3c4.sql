DROP FUNCTION IF EXISTS public.finance_vs_waterfall(date, date);

CREATE FUNCTION public.finance_vs_waterfall(_start date, _end date)
 RETURNS TABLE(
   gross_revenue_cents bigint,
   discount_cents bigint,
   net_revenue_cents bigint,
   ala_carte_net_cents bigint,
   wine_club_net_cents bigint,
   wholesale_net_cents bigint,
   cogs_cents bigint,
   net_after_cogs_cents bigint,
   converting_ad_spend_cents bigint,
   contribution_after_ads_cents bigint,
   net_after_cogs_and_ads_cents bigint,
   ad_conversions bigint,
   ad_attributed_revenue_cents bigint
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _gross bigint := 0;
  _disc bigint := 0;
  _net bigint := 0;
  _alc bigint := 0;
  _wc bigint := 0;
  _ws bigint := 0;
  _cogs bigint := 0;
  _ads bigint := 0;
  _convs bigint := 0;
  _attr_rev bigint := 0;
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT
    COALESCE(SUM(ROUND(COALESCE(t.gross_value,0) * 100)),0)::bigint,
    COALESCE(SUM(ROUND(COALESCE(t.discount,0)    * 100)),0)::bigint,
    COALESCE(SUM(ROUND((COALESCE(t.gross_value,0) - COALESCE(t.discount,0)) * 100))
             FILTER (WHERE upper(t.order_type) NOT IN ('WINE_CLUB','WHOLESALE')), 0)::bigint,
    COALESCE(SUM(ROUND((COALESCE(t.gross_value,0) - COALESCE(t.discount,0)) * 100))
             FILTER (WHERE upper(t.order_type) = 'WINE_CLUB'), 0)::bigint,
    COALESCE(SUM(ROUND((COALESCE(t.gross_value,0) - COALESCE(t.discount,0)) * 100))
             FILTER (WHERE upper(t.order_type) = 'WHOLESALE'), 0)::bigint
  INTO _gross, _disc, _alc, _wc, _ws
  FROM public.vs_transactions t
  WHERE t.transaction_date BETWEEN _start AND _end;

  _net := _gross - _disc;

  SELECT COALESCE(SUM(e.amount_cents),0)::bigint
  INTO _cogs
  FROM public.bm_finance_entries e
  WHERE e.date BETWEEN _start AND _end
    AND e.entry_type = 'cogs';

  SELECT
    COALESCE(SUM(ROUND(f.spend * 100)),0)::bigint,
    COALESCE(SUM(f.conversions),0)::bigint,
    COALESCE(SUM(ROUND(f.revenue * 100)),0)::bigint
  INTO _ads, _convs, _attr_rev
  FROM public.ad_performance_facts f
  WHERE f.date BETWEEN _start AND _end
    AND f.conversions > 0;

  RETURN QUERY SELECT
    _gross, _disc, _net, _alc, _wc, _ws, _cogs,
    (_net - _cogs)::bigint,
    _ads,
    (_net - _ads)::bigint,
    (_net - _cogs - _ads)::bigint,
    _convs, _attr_rev;
END $function$;