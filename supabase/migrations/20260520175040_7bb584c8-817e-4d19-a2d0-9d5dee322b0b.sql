
ALTER TABLE public.wine_subscriptions
  ADD COLUMN IF NOT EXISTS vs_customer_id text,
  ADD COLUMN IF NOT EXISTS vs_product_id text,
  ADD COLUMN IF NOT EXISTS last_order_id text,
  ADD COLUMN IF NOT EXISTS last_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wine_subs_due
  ON public.wine_subscriptions (status, next_ship_date)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.wine_subscription_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.wine_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vs_order_id text,
  vs_customer_id text,
  vs_product_id text,
  quantity integer NOT NULL,
  amount_cents integer,
  success boolean NOT NULL,
  error text,
  request_payload jsonb,
  response_payload jsonb,
  triggered_by text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsc_subscription ON public.wine_subscription_charges (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wsc_user ON public.wine_subscription_charges (user_id, created_at DESC);

ALTER TABLE public.wine_subscription_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription charges"
  ON public.wine_subscription_charges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all subscription charges"
  ON public.wine_subscription_charges FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Service role writes subscription charges"
  ON public.wine_subscription_charges FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()));
