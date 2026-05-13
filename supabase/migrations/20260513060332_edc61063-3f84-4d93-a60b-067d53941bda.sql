-- Unified orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Customer info (snapshot, also supports guest checkout)
  customer_email TEXT NOT NULL,
  customer_first_name TEXT NOT NULL,
  customer_last_name TEXT NOT NULL,
  customer_phone TEXT,
  date_of_birth DATE,
  
  -- Shipping address
  ship_address1 TEXT NOT NULL,
  ship_address2 TEXT,
  ship_city TEXT NOT NULL,
  ship_state TEXT NOT NULL,
  ship_zip TEXT NOT NULL,
  ship_country TEXT NOT NULL DEFAULT 'US',
  
  -- Money (in cents)
  wine_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  merch_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  
  -- Payment (single Stripe charge covers everything)
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','authorized','paid','failed','refunded','partial_refund')),
  
  -- Fulfillment legs
  vinoshipper_order_id TEXT,
  vinoshipper_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (vinoshipper_status IN ('not_applicable','pending','submitted','accepted','rejected','shipped','delivered','failed')),
  merch_fulfillment_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (merch_fulfillment_status IN ('not_applicable','pending','processing','shipped','delivered','failed')),
  
  -- Compliance snapshot
  age_verified BOOLEAN NOT NULL DEFAULT false,
  
  -- Misc
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_email ON public.orders(customer_email);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX idx_orders_vinoshipper_order_id ON public.orders(vinoshipper_order_id);

-- Order line items
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  product_kind TEXT NOT NULL CHECK (product_kind IN ('wine','merch')),
  product_id UUID, -- references wine_products.id OR merch_products.id (loose ref by kind)
  vinoshipper_product_id TEXT, -- for wine items, the VS product id
  
  -- Snapshot fields (resilient to product changes)
  product_name TEXT NOT NULL,
  product_sku TEXT,
  variant_name TEXT,
  
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_kind ON public.order_items(product_kind);

-- updated_at trigger for orders
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Customers: view their own orders (only when authenticated and matched by user_id)
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
  ));

-- Admins/owners: full access
CREATE POLICY "Admins manage all orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins manage all order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- NOTE: Inserts/updates by checkout flow happen via edge function with the service role key,
-- which bypasses RLS. Guest order lookup happens via a server-side lookup by email + order_number
-- (to be implemented as an edge function), so no public SELECT policy is needed.