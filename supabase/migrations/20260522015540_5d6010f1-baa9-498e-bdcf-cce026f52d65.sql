-- ============================================================
-- Subscribe & Save (auto-ship) foundation — Model B
-- We own the scheduler; Vinoshipper is the order sink.
-- ============================================================

-- Enums --------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'pending_first_order', 'active', 'paused', 'past_due', 'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_engine AS ENUM ('self', 'vinoshipper');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_cycle_status AS ENUM (
    'pending', 'attempting', 'succeeded', 'failed', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- subscriptions -----------------------------------------------
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'pending_first_order',
  engine public.subscription_engine NOT NULL DEFAULT 'self',

  -- cadence
  cadence_weeks INTEGER NOT NULL CHECK (cadence_weeks BETWEEN 1 AND 52),
  next_ship_date DATE,
  last_ship_date DATE,
  cycles_completed INTEGER NOT NULL DEFAULT 0,

  -- ship + pay
  ship_address JSONB,                         -- snapshot of address used at creation
  vs_customer_id TEXT,                        -- Vinoshipper external customer id
  vs_payment_method_token TEXT,               -- VS-issued token for saved card
  vs_subscription_id TEXT,                    -- only set when engine = 'vinoshipper'

  -- behavior
  discount_code TEXT,                         -- S&S promo locked at signup
  notes TEXT,
  paused_until DATE,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_due ON public.subscriptions(next_ship_date)
  WHERE status = 'active';
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Staff view all subscriptions"
  ON public.subscriptions FOR SELECT
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_wine_club_manager(auth.uid())
  );

CREATE POLICY "Staff update all subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_wine_club_manager(auth.uid())
  );

CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- subscription_items ------------------------------------------
CREATE TABLE public.subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER,                   -- snapshot; null = use current
  rotation_rule JSONB,                        -- optional: {"type":"red_rotation"} etc.
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_items_sub ON public.subscription_items(subscription_id);

ALTER TABLE public.subscription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription items"
  ON public.subscription_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Users manage own subscription items"
  ON public.subscription_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Staff view all subscription items"
  ON public.subscription_items FOR SELECT
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_wine_club_manager(auth.uid())
  );

CREATE TRIGGER trg_subscription_items_updated
  BEFORE UPDATE ON public.subscription_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- subscription_cycles -----------------------------------------
CREATE TABLE public.subscription_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  scheduled_for DATE NOT NULL,
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status public.subscription_cycle_status NOT NULL DEFAULT 'pending',

  -- Vinoshipper linkage
  vs_order_id TEXT,
  idempotency_key TEXT NOT NULL,

  -- snapshot of charge
  subtotal_cents INTEGER,
  shipping_cents INTEGER,
  tax_cents INTEGER,
  total_cents INTEGER,
  line_items JSONB,                           -- frozen list at attempt time

  -- failure tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (subscription_id, cycle_number),
  UNIQUE (idempotency_key)
);

CREATE INDEX idx_subscription_cycles_sub ON public.subscription_cycles(subscription_id);
CREATE INDEX idx_subscription_cycles_due ON public.subscription_cycles(scheduled_for)
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_subscription_cycles_retry ON public.subscription_cycles(next_retry_at)
  WHERE status = 'failed';

ALTER TABLE public.subscription_cycles ENABLE ROW LEVEL SECURITY;

-- Customers: read-only on own cycles. All writes via service role.
CREATE POLICY "Users view own cycles"
  ON public.subscription_cycles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Staff view all cycles"
  ON public.subscription_cycles FOR SELECT
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_wine_club_manager(auth.uid())
  );

CREATE TRIGGER trg_subscription_cycles_updated
  BEFORE UPDATE ON public.subscription_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- subscription_events -----------------------------------------
CREATE TABLE public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES public.subscription_cycles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,                   -- created|paused|resumed|skipped|payment_failed|payment_recovered|swapped|canceled|cadence_changed|address_changed
  actor_id UUID,                              -- auth user who triggered (null = system)
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_events_sub ON public.subscription_events(subscription_id, created_at DESC);
CREATE INDEX idx_subscription_events_type ON public.subscription_events(event_type);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscription events"
  ON public.subscription_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Staff view all subscription events"
  ON public.subscription_events FOR SELECT
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_wine_club_manager(auth.uid())
  );