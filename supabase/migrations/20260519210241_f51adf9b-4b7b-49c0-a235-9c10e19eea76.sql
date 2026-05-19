CREATE TABLE IF NOT EXISTS public.dtc_historical_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL,
  order_date date NOT NULL,
  source text NOT NULL DEFAULT 'vinoshipper_csv',
  channel text NOT NULL DEFAULT 'dtc',
  customer_email text,
  ship_state text,
  ship_zip text,
  currency text DEFAULT 'USD',
  subtotal_cents integer NOT NULL DEFAULT 0,
  shipping_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  units integer,
  sku text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dtc_historical_orders_external_id_key UNIQUE (external_id)
);

CREATE INDEX IF NOT EXISTS idx_dtc_hist_orders_date ON public.dtc_historical_orders (order_date);
CREATE INDEX IF NOT EXISTS idx_dtc_hist_orders_source ON public.dtc_historical_orders (source);
CREATE INDEX IF NOT EXISTS idx_dtc_hist_orders_state ON public.dtc_historical_orders (ship_state);

ALTER TABLE public.dtc_historical_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kennel viewers can read dtc_historical_orders"
  ON public.dtc_historical_orders
  FOR SELECT
  TO authenticated
  USING (public.can_view_kennel(auth.uid()));

CREATE POLICY "Ad ops can manage dtc_historical_orders"
  ON public.dtc_historical_orders
  FOR ALL
  TO authenticated
  USING (public.is_ad_ops(auth.uid()))
  WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_dtc_hist_orders_updated_at
  BEFORE UPDATE ON public.dtc_historical_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();