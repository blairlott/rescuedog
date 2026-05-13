
CREATE TABLE public.loyalty_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ledger_id uuid,
  reward_id text NOT NULL,
  reward_title text NOT NULL,
  reward_category text NOT NULL,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  ship_state text,
  status text NOT NULL DEFAULT 'pending',
  simulated boolean NOT NULL DEFAULT false,
  client_request_id text,
  fulfillment_notes text,
  fulfilled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id)
);

ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own redemptions"
ON public.loyalty_redemptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all redemptions"
ON public.loyalty_redemptions FOR SELECT
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins update redemptions"
ON public.loyalty_redemptions FOR UPDATE
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_loyalty_redemptions_updated_at
BEFORE UPDATE ON public.loyalty_redemptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_loyalty_redemptions_user ON public.loyalty_redemptions(user_id, created_at DESC);
CREATE INDEX idx_loyalty_redemptions_status ON public.loyalty_redemptions(status);

-- Customer-callable redemption: deducts points from caller's own balance.
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  _reward_id text,
  _reward_title text,
  _reward_category text,
  _points_cost integer,
  _ship_state text DEFAULT NULL,
  _client_request_id text DEFAULT NULL,
  _simulated boolean DEFAULT false,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (redemption_id uuid, ledger_id uuid, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _balance integer;
  _existing public.loyalty_redemptions%ROWTYPE;
  _ledger_id uuid;
  _redemption_id uuid;
  _blocked text[] := ARRAY['UT','PA','MS','AL','TN','TX','NC','KY','MA','CT','NY','MI','IN','MO'];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _points_cost IS NULL OR _points_cost <= 0 THEN
    RAISE EXCEPTION 'invalid points_cost';
  END IF;
  IF _ship_state IS NOT NULL AND upper(_ship_state) = ANY (_blocked) THEN
    RAISE EXCEPTION 'redemption not allowed in state %', _ship_state;
  END IF;

  -- Idempotency
  IF _client_request_id IS NOT NULL THEN
    SELECT * INTO _existing FROM public.loyalty_redemptions
    WHERE user_id = _uid AND client_request_id = _client_request_id;
    IF FOUND THEN
      SELECT points_balance INTO _balance FROM public.loyalty_accounts WHERE user_id = _uid;
      RETURN QUERY SELECT _existing.id, _existing.ledger_id, COALESCE(_balance, 0);
      RETURN;
    END IF;
  END IF;

  -- Ensure account row
  INSERT INTO public.loyalty_accounts (user_id, points_balance, lifetime_points_earned)
  VALUES (_uid, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  -- Lock + check balance
  SELECT points_balance INTO _balance FROM public.loyalty_accounts
    WHERE user_id = _uid FOR UPDATE;
  IF COALESCE(_balance, 0) < _points_cost THEN
    RAISE EXCEPTION 'insufficient points (have %, need %)', COALESCE(_balance, 0), _points_cost;
  END IF;

  -- Insert ledger (negative)
  INSERT INTO public.loyalty_ledger (user_id, delta_points, event_type, reason, metadata)
  VALUES (_uid, -_points_cost, 'redeem', _reward_title, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _ledger_id;

  -- Update balance
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance - _points_cost,
      updated_at = now()
  WHERE user_id = _uid
  RETURNING points_balance INTO _balance;

  -- Create redemption record
  INSERT INTO public.loyalty_redemptions (
    user_id, ledger_id, reward_id, reward_title, reward_category,
    points_cost, ship_state, status, simulated, client_request_id, metadata
  ) VALUES (
    _uid, _ledger_id, _reward_id, _reward_title, _reward_category,
    _points_cost, upper(NULLIF(_ship_state, '')), 'pending', _simulated, _client_request_id, COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO _redemption_id;

  RETURN QUERY SELECT _redemption_id, _ledger_id, _balance;
END;
$$;

-- Customer-callable simulated earn (UX testing only; clearly marked "simulated").
CREATE OR REPLACE FUNCTION public.simulate_loyalty_earn(
  _subtotal_cents integer,
  _client_request_id text DEFAULT NULL
)
RETURNS TABLE (ledger_id uuid, points_awarded integer, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _delta integer;
  _ledger_id uuid;
  _balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _subtotal_cents IS NULL OR _subtotal_cents <= 0 THEN
    RAISE EXCEPTION 'invalid subtotal';
  END IF;
  -- Cap simulated earn to avoid abuse during testing.
  IF _subtotal_cents > 100000 THEN
    RAISE EXCEPTION 'simulated subtotal capped at $1000';
  END IF;

  _delta := GREATEST(0, FLOOR(_subtotal_cents / 100))::integer;
  IF _delta = 0 THEN RAISE EXCEPTION 'no points to award'; END IF;

  -- Idempotency via metadata client_request_id (best-effort).
  IF _client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.loyalty_ledger
    WHERE user_id = _uid AND metadata->>'client_request_id' = _client_request_id
  ) THEN
    SELECT points_balance INTO _balance FROM public.loyalty_accounts WHERE user_id = _uid;
    RETURN QUERY SELECT NULL::uuid, 0, COALESCE(_balance, 0);
    RETURN;
  END IF;

  INSERT INTO public.loyalty_accounts (user_id, points_balance, lifetime_points_earned)
  VALUES (_uid, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.loyalty_ledger (user_id, delta_points, event_type, reason, subtotal_cents, metadata)
  VALUES (
    _uid, _delta, 'earn_simulated',
    'Simulated purchase ($' || (_subtotal_cents/100.0)::numeric(10,2) || ')',
    _subtotal_cents,
    jsonb_build_object('simulated', true, 'client_request_id', _client_request_id)
  )
  RETURNING id INTO _ledger_id;

  UPDATE public.loyalty_accounts
  SET points_balance = points_balance + _delta,
      lifetime_points_earned = lifetime_points_earned + _delta,
      updated_at = now()
  WHERE user_id = _uid
  RETURNING points_balance INTO _balance;

  RETURN QUERY SELECT _ledger_id, _delta, _balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points(text,text,text,integer,text,text,boolean,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_loyalty_earn(integer,text) TO authenticated;
