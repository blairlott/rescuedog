
-- Vinoshipper per-order mirror
CREATE TABLE public.vs_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice TEXT NOT NULL UNIQUE,
  transaction_date DATE,
  transaction_type TEXT,
  ship_date DATE,
  requested_ship_date DATE,
  store TEXT,
  delivery_type TEXT,
  inventory_location TEXT,
  tracking TEXT,
  payment_type TEXT,
  terms TEXT,
  club TEXT,
  release TEXT,
  order_type TEXT,
  license_type TEXT,
  sold_by TEXT,
  sale_location TEXT,
  sold_by_team_member TEXT,
  referrer TEXT,
  discount_code TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_id TEXT,
  active_club_member BOOLEAN,
  business_name TEXT,
  customer_street TEXT,
  customer_city TEXT,
  customer_state TEXT,
  customer_zip TEXT,
  ship_to_first_name TEXT,
  ship_to_last_name TEXT,
  ship_to_business_name TEXT,
  ship_to_street TEXT,
  ship_to_city TEXT,
  ship_to_county TEXT,
  ship_to_state TEXT,
  ship_to_zip TEXT,
  bottles NUMERIC,
  liters NUMERIC,
  gross_value NUMERIC,
  discount NUMERIC,
  taxable_value NUMERIC,
  non_taxable_value NUMERIC,
  total_sales_tax NUMERIC,
  excise_tax NUMERIC,
  custom_state_tax NUMERIC,
  packaging NUMERIC,
  shipping_to_customer NUMERIC,
  tip_collected NUMERIC,
  order_total NUMERIC,
  credit_applied NUMERIC,
  funds_received NUMERIC,
  cash_external NUMERIC,
  vinoshipper_funds NUMERIC,
  cc_fee NUMERIC,
  pick_pack_fee NUMERIC,
  vinoshipper_fee NUMERIC,
  platform_total NUMERIC,
  producer_payment NUMERIC,
  statement_num TEXT,
  paid_on DATE,
  successor_order TEXT,
  final_order TEXT,
  chain_status TEXT,
  attribution_gross_product_value NUMERIC,
  attribution_product_discounts NUMERIC,
  attribution_shipping NUMERIC,
  attribution_packaging NUMERIC,
  attribution_taxes NUMERIC,
  attribution_fees NUMERIC,
  attribution_tip NUMERIC,
  attribution_credit NUMERIC,
  attribution_funds_received NUMERIC,
  raw JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vs_tx_date ON public.vs_transactions(transaction_date DESC);
CREATE INDEX idx_vs_tx_customer ON public.vs_transactions(customer_id);
CREATE INDEX idx_vs_tx_email ON public.vs_transactions(lower(customer_email));
CREATE INDEX idx_vs_tx_state ON public.vs_transactions(ship_to_state);
CREATE INDEX idx_vs_tx_club ON public.vs_transactions(active_club_member) WHERE active_club_member;
CREATE INDEX idx_vs_tx_chain ON public.vs_transactions(chain_status);

ALTER TABLE public.vs_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view tx" ON public.vs_transactions FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "admins write tx" ON public.vs_transactions FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_vs_tx_updated BEFORE UPDATE ON public.vs_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lifetime SKU rollup
CREATE TABLE public.vs_products_lifetime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT,
  year TEXT,
  name TEXT NOT NULL,
  sku TEXT,
  upc TEXT,
  product_category TEXT,
  store TEXT,
  gross_value NUMERIC,
  discount NUMERIC,
  value NUMERIC,
  quantity_sold INTEGER,
  shipped_picked_up INTEGER,
  in_open_orders INTEGER,
  discount_code TEXT,
  is_multipack BOOLEAN NOT NULL DEFAULT false,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vs_prod_sku ON public.vs_products_lifetime(sku);

ALTER TABLE public.vs_products_lifetime ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view prod" ON public.vs_products_lifetime FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "admins write prod" ON public.vs_products_lifetime FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Abandoned carts
CREATE TABLE public.vs_abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_seen DATE,
  buyer_email TEXT,
  buyer_phone TEXT,
  buyer_salutation TEXT,
  buyer_first_name TEXT,
  buyer_last_name TEXT,
  ship_first_name TEXT,
  ship_last_name TEXT,
  ship_street TEXT,
  ship_city TEXT,
  ship_state TEXT,
  ship_zip TEXT,
  cart_value NUMERIC,
  skus TEXT[],
  sales_contents TEXT,
  problems TEXT,
  upcs TEXT[],
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vs_cart_last_seen ON public.vs_abandoned_carts(last_seen DESC);
CREATE INDEX idx_vs_cart_email ON public.vs_abandoned_carts(lower(buyer_email));

ALTER TABLE public.vs_abandoned_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view carts" ON public.vs_abandoned_carts FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));
CREATE POLICY "admins write carts" ON public.vs_abandoned_carts FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));
