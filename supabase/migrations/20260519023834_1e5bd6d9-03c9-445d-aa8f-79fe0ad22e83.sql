
-- ── kennel_geo_modifiers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kennel_geo_modifiers (
  state text PRIMARY KEY,
  modifier numeric(5,3) NOT NULL DEFAULT 1.000,
  customers integer,
  orders integer,
  revenue_cents bigint,
  avg_ltv_cents bigint,
  repeat_rate_pct numeric(5,2),
  tier text,
  notes text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kennel_geo_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel viewers can read geo modifiers"
  ON public.kennel_geo_modifiers FOR SELECT TO authenticated
  USING (public.can_view_kennel(auth.uid()));
CREATE TRIGGER kennel_geo_modifiers_updated_at
  BEFORE UPDATE ON public.kennel_geo_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── kennel_seasonality_curve ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kennel_seasonality_curve (
  month smallint PRIMARY KEY CHECK (month BETWEEN 1 AND 12),
  budget_index numeric(5,3) NOT NULL DEFAULT 1.000,
  revenue_cents bigint,
  orders integer,
  avg_aov_cents bigint,
  years_observed integer,
  notes text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kennel_seasonality_curve ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel viewers can read seasonality"
  ON public.kennel_seasonality_curve FOR SELECT TO authenticated
  USING (public.can_view_kennel(auth.uid()));
CREATE TRIGGER kennel_seasonality_curve_updated_at
  BEFORE UPDATE ON public.kennel_seasonality_curve
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.kennel_seasonality_curve (month, budget_index, notes)
SELECT g, 1.000, 'seed' FROM generate_series(1,12) g
ON CONFLICT (month) DO NOTHING;

-- ── kennel_retention_risk_view ───────────────────────────────────────
-- Customers in the 60–90 day winback window (since last consumer order),
-- aggregated per state. No PII; safe to expose to anyone with Kennel access.
CREATE OR REPLACE VIEW public.kennel_retention_risk_summary AS
WITH last_ord AS (
  SELECT COALESCE(customer_id, customer_email) AS cust_key,
         ship_to_state AS state,
         MAX(transaction_date::date) AS last_d,
         SUM(order_total) AS lifetime_value,
         COUNT(*) AS lifetime_orders
  FROM public.vs_transactions
  WHERE transaction_type='ORDER' AND order_type='CONSUMER'
    AND (chain_status IS NULL OR chain_status <> 'Cancelled')
    AND order_total > 0
    AND COALESCE(customer_id, customer_email) IS NOT NULL
  GROUP BY 1, 2
), in_window AS (
  SELECT * FROM last_ord
  WHERE last_d BETWEEN (CURRENT_DATE - 90) AND (CURRENT_DATE - 60)
)
SELECT
  COALESCE(state, 'UNKNOWN') AS state,
  COUNT(*)::int AS at_risk_customers,
  ROUND(SUM(lifetime_value)::numeric, 0) AS at_risk_lifetime_value,
  ROUND(AVG(lifetime_value)::numeric, 0) AS avg_lifetime_value,
  COUNT(*) FILTER (WHERE lifetime_orders >= 2)::int AS repeat_buyers_at_risk
FROM in_window
GROUP BY 1
ORDER BY at_risk_customers DESC;

ALTER VIEW public.kennel_retention_risk_summary SET (security_invoker = true);
GRANT SELECT ON public.kennel_retention_risk_summary TO authenticated;
