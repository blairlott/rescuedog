DROP FUNCTION IF EXISTS public.compute_segflow_signals();

CREATE OR REPLACE FUNCTION public.compute_segflow_signals()
RETURNS TABLE(
  total_emails bigint,
  reorder_nudge bigint,
  churn_risk bigint,
  winback bigint,
  first_timer_no_repeat bigint,
  cart_abandoner bigint,
  unchanged bigint,
  changed bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _total bigint; _rn bigint; _cr bigint; _wb bigint; _ftnr bigint; _ca bigint;
  _changed bigint; _unchanged bigint;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.is_ad_ops(auth.uid())
     AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  WITH agg AS (
    SELECT
      lower(trim(customer_email)) AS email,
      MAX(transaction_date)        AS last_order_at,
      COUNT(*)::int                AS order_count,
      ROUND(COALESCE(SUM(order_total),0) * 100)::bigint AS ltv_cents
    FROM public.vs_transactions
    WHERE customer_email IS NOT NULL
      AND order_total IS NOT NULL
      AND order_total > 0
    GROUP BY lower(trim(customer_email))
  ),
  carts AS (
    SELECT
      lower(trim(email)) AS email,
      MAX(last_activity_at) AS last_cart_at
    FROM public.abandoned_carts
    WHERE recovered_at IS NULL
      AND item_count > 0
      AND email IS NOT NULL
      AND last_activity_at <= now() - interval '2 hours'
      AND last_activity_at >= now() - interval '72 hours'
    GROUP BY lower(trim(email))
  ),
  emails AS (
    SELECT email FROM agg
    UNION
    SELECT email FROM carts
  ),
  scored AS (
    SELECT
      e.email,
      a.last_order_at,
      EXTRACT(DAY FROM (now() - a.last_order_at))::int AS days_since,
      COALESCE(a.order_count, 0) AS order_count,
      COALESCE(a.ltv_cents, 0)   AS ltv_cents,
      CASE
        WHEN a.order_count = 1
          AND a.last_order_at BETWEEN (now() - interval '60 days') AND (now() - interval '21 days')
        THEN 'first_timer_no_repeat'
        WHEN a.order_count >= 2
          AND a.last_order_at BETWEEN (now() - interval '60 days') AND (now() - interval '30 days')
        THEN 'reorder_nudge'
        WHEN a.last_order_at BETWEEN (now() - interval '180 days') AND (now() - interval '90 days')
        THEN 'churn_risk'
        WHEN a.last_order_at BETWEEN (now() - interval '365 days') AND (now() - interval '180 days')
        THEN 'winback'
        WHEN c.email IS NOT NULL
        THEN 'cart_abandoner'
        ELSE 'none'
      END AS new_signal
    FROM emails e
    LEFT JOIN agg   a ON a.email = e.email
    LEFT JOIN carts c ON c.email = e.email
  )
  INSERT INTO public.segflow_signals
    (email, signal, previous_signal, last_order_at, days_since_order,
     order_count, ltv_cents, computed_at, signal_changed_at)
  SELECT s.email, s.new_signal, NULL, s.last_order_at, s.days_since,
         s.order_count, s.ltv_cents, now(), now()
  FROM scored s
  ON CONFLICT (email) DO UPDATE
    SET previous_signal   = public.segflow_signals.signal,
        signal            = EXCLUDED.signal,
        last_order_at     = EXCLUDED.last_order_at,
        days_since_order  = EXCLUDED.days_since_order,
        order_count       = EXCLUDED.order_count,
        ltv_cents         = EXCLUDED.ltv_cents,
        computed_at       = now(),
        signal_changed_at = CASE
          WHEN public.segflow_signals.signal IS DISTINCT FROM EXCLUDED.signal
            THEN now()
          ELSE public.segflow_signals.signal_changed_at
        END;

  SELECT COUNT(*) INTO _total FROM public.segflow_signals;
  SELECT COUNT(*) INTO _rn   FROM public.segflow_signals WHERE signal = 'reorder_nudge';
  SELECT COUNT(*) INTO _cr   FROM public.segflow_signals WHERE signal = 'churn_risk';
  SELECT COUNT(*) INTO _wb   FROM public.segflow_signals WHERE signal = 'winback';
  SELECT COUNT(*) INTO _ftnr FROM public.segflow_signals WHERE signal = 'first_timer_no_repeat';
  SELECT COUNT(*) INTO _ca   FROM public.segflow_signals WHERE signal = 'cart_abandoner';
  SELECT COUNT(*) INTO _changed   FROM public.segflow_signals
    WHERE signal_changed_at >= now() - interval '2 minutes';
  _unchanged := _total - _changed;

  RETURN QUERY SELECT _total, _rn, _cr, _wb, _ftnr, _ca, _unchanged, _changed;
END;
$function$;

INSERT INTO public.segflow_offers
  (signal, offer_title, offer_sku, offer_url, offer_price_cents, mailchimp_tag, mailchimp_journey, notes, active)
VALUES (
  'cart_abandoner',
  '6-Bottle Sampler Pack',
  'mothersday6pack',
  'https://rescuedogwines.com/wines/mothers-day-6-pack',
  null,
  'signal:cart_abandoner',
  'cart_abandoner_v1',
  'Lovable-side carts only (Shopify merch + pre-VS wine). Vinoshipper-stage carts are handled by the native VS-Mailchimp integration.',
  true
)
ON CONFLICT (signal) DO NOTHING;