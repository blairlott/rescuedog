
-- ============================================================
-- Product reviews
-- ============================================================
CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_handle text NOT NULL,
  product_kind text NOT NULL DEFAULT 'wine' CHECK (product_kind IN ('wine','merch')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id uuid,
  reviewer_name text NOT NULL,
  reviewer_email text,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_reviews_handle_status ON public.product_reviews(product_handle, status);
CREATE INDEX idx_product_reviews_user ON public.product_reviews(user_id);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published reviews"
  ON public.product_reviews FOR SELECT
  USING (status = 'published');

CREATE POLICY "Owners read their own reviews"
  ON public.product_reviews FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Admins read all reviews"
  ON public.product_reviews FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Customers create own reviews"
  ON public.product_reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Customers update own pending reviews"
  ON public.product_reviews FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage reviews"
  ON public.product_reviews FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins delete reviews"
  ON public.product_reviews FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Loyalty: Rescue Rewards
-- ============================================================
CREATE TABLE public.loyalty_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0,
  lifetime_points_earned integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'rescue' CHECK (tier IN ('rescue','adopter','guardian','hero')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own loyalty account"
  ON public.loyalty_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all loyalty accounts"
  ON public.loyalty_accounts FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_loyalty_accounts_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_points integer NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('earned','redeemed','adjusted','expired','referral','signup_bonus','birthday')),
  reason text NOT NULL,
  order_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_ledger_user_created ON public.loyalty_ledger(user_id, created_at DESC);

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own loyalty ledger"
  ON public.loyalty_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all loyalty ledger"
  ON public.loyalty_ledger FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));
