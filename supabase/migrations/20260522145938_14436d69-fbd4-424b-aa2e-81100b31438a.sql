CREATE OR REPLACE FUNCTION public.finance_vs_summary(_start date, _end date)
 RETURNS TABLE(order_count bigint, revenue_cents bigint, aov_cents bigint, wine_club_cents bigint, ala_carte_cents bigint, wholesale_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_finance(auth.uid()) THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN QUERY
  SELECT COUNT(*)::bigint,
         COALESCE(SUM(ROUND(t.order_total * 100)),0)::bigint,
         CASE WHEN COUNT(*) > 0
              THEN (COALESCE(SUM(ROUND(t.order_total * 100)),0) / COUNT(*))::bigint
              ELSE 0 END,
         COALESCE(SUM(ROUND(t.order_total * 100)) FILTER (WHERE upper(t.order_type) = 'WINE_CLUB'),0)::bigint,
         COALESCE(SUM(ROUND(t.order_total * 100)) FILTER (WHERE upper(t.order_type) NOT IN ('WINE_CLUB','WHOLESALE')),0)::bigint,
         COALESCE(SUM(ROUND(t.order_total * 100)) FILTER (WHERE upper(t.order_type) = 'WHOLESALE'),0)::bigint
  FROM public.vs_transactions t
  WHERE t.transaction_date BETWEEN _start AND _end
    AND t.order_total IS NOT NULL;
END $function$;