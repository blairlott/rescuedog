
-- =========================================================
-- Segflow signaling table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.segflow_signals (
  email             text PRIMARY KEY,
  signal            text NOT NULL CHECK (signal IN ('none','reorder_nudge','churn_risk','winback')),
  previous_signal   text,
  last_order_at     timestamptz,
  days_since_order  integer,
  order_count       integer NOT NULL DEFAULT 0,
  ltv_cents         bigint  NOT NULL DEFAULT 0,
  mailchimp_tag     text,           -- last tag pushed to Mailchimp
  pushed_at         timestamptz,    -- last push attempt
  push_status       text,           -- 'ok' | 'error' | null
  push_error        text,
  computed_at       timestamptz NOT NULL DEFAULT now(),
  signal_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_segflow_signals_signal ON public.segflow_signals (signal);
CREATE INDEX IF NOT EXISTS idx_segflow_signals_changed ON public.segflow_signals (signal_changed_at DESC);

ALTER TABLE public.segflow_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segflow_signals_select"
  ON public.segflow_signals FOR SELECT
  TO authenticated
  USING (public.can_view_kennel(auth.uid()) OR public.is_backend_viewer(auth.uid()));

CREATE POLICY "segflow_signals_service_write"
  ON public.segflow_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_segflow_signals_updated_at
  BEFORE UPDATE ON public.segflow_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- compute_segflow_signals() — recompute every email's signal
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_segflow_signals()
RETURNS TABLE (
  total_emails       bigint,
  reorder_nudge      bigint,
  churn_risk         bigint,
  winback            bigint,
  unchanged          bigint,
  changed            bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total bigint; _rn bigint; _cr bigint; _wb bigint;
  _changed bigint; _unchanged bigint;
BEGIN
  -- Only service role or ad_ops/admin may run this.
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
        -- Reorder nudge: repeat buyer, last order 30-60 days ago
        WHEN a.order_count >= 2
          AND a.last_order_at BETWEEN (now() - interval '60 days') AND (now() - interval '30 days')
        THEN 'reorder_nudge'
        -- Churn risk: 90-180 days dormant
        WHEN a.last_order_at BETWEEN (now() - interval '180 days') AND (now() - interval '90 days')
        THEN 'churn_risk'
        -- Winback: 180-365 days dormant
        WHEN a.last_order_at BETWEEN (now() - interval '365 days') AND (now() - interval '180 days')
        THEN 'winback'
        ELSE 'none'
      END AS new_signal
    FROM agg a
  )
  INSERT INTO public.segflow_signals
    (email, signal, previous_signal, last_order_at, days_since_order,
     order_count, ltv_cents, computed_at, signal_changed_at)
  SELECT
    s.email,
    s.new_signal,
    NULL,
    s.last_order_at,
    s.days_since,
    s.order_count,
    s.ltv_cents,
    now(),
    now()
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
  SELECT COUNT(*) INTO _rn FROM public.segflow_signals WHERE signal = 'reorder_nudge';
  SELECT COUNT(*) INTO _cr FROM public.segflow_signals WHERE signal = 'churn_risk';
  SELECT COUNT(*) INTO _wb FROM public.segflow_signals WHERE signal = 'winback';
  SELECT COUNT(*) INTO _changed   FROM public.segflow_signals
    WHERE signal_changed_at >= (now() - interval '5 minutes');
  _unchanged := _total - _changed;

  RETURN QUERY SELECT _total, _rn, _cr, _wb, _unchanged, _changed;
END;
$$;

-- =========================================================
-- segflow_signal_diffs() — rows changed in last N minutes
-- =========================================================
CREATE OR REPLACE FUNCTION public.segflow_signal_diffs(_since timestamptz)
RETURNS TABLE (
  email           text,
  signal          text,
  previous_signal text,
  last_order_at   timestamptz,
  order_count     integer,
  ltv_cents       bigint,
  mailchimp_tag   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT email, signal, previous_signal, last_order_at, order_count, ltv_cents, mailchimp_tag
  FROM public.segflow_signals
  WHERE signal_changed_at >= _since
  ORDER BY signal_changed_at DESC
$$;
