-- 1. Widen signal check
ALTER TABLE public.segflow_signals
  DROP CONSTRAINT IF EXISTS segflow_signals_signal_check;

ALTER TABLE public.segflow_signals
  ADD CONSTRAINT segflow_signals_signal_check
  CHECK (signal = ANY (ARRAY[
    'none','reorder_nudge','churn_risk','winback',
    'first_timer_no_repeat','cart_abandoner'
  ]));

-- 2. Offers table
CREATE TABLE IF NOT EXISTS public.segflow_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal text NOT NULL UNIQUE,
  offer_title text NOT NULL,
  offer_sku text,
  offer_url text,
  offer_price_cents integer,
  mailchimp_tag text NOT NULL,
  mailchimp_journey text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segflow_offers_signal_check CHECK (signal = ANY (ARRAY[
    'reorder_nudge','churn_risk','winback','first_timer_no_repeat','cart_abandoner'
  ]))
);

ALTER TABLE public.segflow_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kennel can view segflow offers" ON public.segflow_offers;
CREATE POLICY "kennel can view segflow offers"
  ON public.segflow_offers FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

DROP POLICY IF EXISTS "ad ops can manage segflow offers" ON public.segflow_offers;
CREATE POLICY "ad ops can manage segflow offers"
  ON public.segflow_offers FOR ALL
  USING (public.is_ad_ops(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

DROP TRIGGER IF EXISTS segflow_offers_touch_updated ON public.segflow_offers;
CREATE TRIGGER segflow_offers_touch_updated
  BEFORE UPDATE ON public.segflow_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Drop + recreate compute fn (return type changed)
DROP FUNCTION IF EXISTS public.compute_segflow_signals();

CREATE FUNCTION public.compute_segflow_signals()
 RETURNS TABLE(total_emails bigint, reorder_nudge bigint, churn_risk bigint, winback bigint,
               first_timer_no_repeat bigint, unchanged bigint, changed bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total bigint; _rn bigint; _cr bigint; _wb bigint; _ftnr bigint;
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
  scored AS (
    SELECT
      a.email,
      a.last_order_at,
      EXTRACT(DAY FROM (now() - a.last_order_at))::int AS days_since,
      a.order_count,
      a.ltv_cents,
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
        ELSE 'none'
      END AS new_signal
    FROM agg a
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
  SELECT COUNT(*) INTO _changed FROM public.segflow_signals
    WHERE signal_changed_at >= (now() - interval '5 minutes');
  _unchanged := _total - _changed;

  RETURN QUERY SELECT _total, _rn, _cr, _wb, _ftnr, _unchanged, _changed;
END;
$function$;