CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shopify_cart_id TEXT,
  shopify_checkout_url TEXT,
  fbc TEXT,
  fbp TEXT,
  gclid TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email_open
  ON public.abandoned_carts (email) WHERE recovered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_user
  ON public.abandoned_carts (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view abandoned carts"
  ON public.abandoned_carts FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users can insert own abandoned cart"
  ON public.abandoned_carts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users can update own abandoned cart"
  ON public.abandoned_carts FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE TRIGGER trg_abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();