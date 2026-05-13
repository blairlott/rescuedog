
-- Track the dollar basis for each ledger entry (helps audits and refunds).
ALTER TABLE public.loyalty_ledger
  ADD COLUMN IF NOT EXISTS subtotal_cents integer;

-- Atomic award: upsert account, insert ledger row, bump balances.
CREATE OR REPLACE FUNCTION public.award_loyalty_points(
  _user_id uuid,
  _delta_points integer,
  _event_type text,
  _reason text,
  _order_id uuid DEFAULT NULL,
  _subtotal_cents integer DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ledger_id uuid;
  _is_admin boolean;
BEGIN
  -- Only service role or admin/owner may call.
  _is_admin := COALESCE(public.is_admin_or_owner(auth.uid()), false);
  IF auth.role() <> 'service_role' AND NOT _is_admin THEN
    RAISE EXCEPTION 'permission denied: award_loyalty_points requires admin or service role';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;
  IF _delta_points IS NULL OR _delta_points = 0 THEN
    RAISE EXCEPTION 'delta_points must be non-zero';
  END IF;

  -- Idempotency: if an order_id is given, skip if we already awarded for that order+event.
  IF _order_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.loyalty_ledger
      WHERE order_id = _order_id AND event_type = _event_type AND user_id = _user_id
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Ensure account row exists.
  INSERT INTO public.loyalty_accounts (user_id, points_balance, lifetime_points_earned)
  VALUES (_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert ledger entry.
  INSERT INTO public.loyalty_ledger (
    user_id, delta_points, event_type, reason, order_id, subtotal_cents, metadata
  )
  VALUES (
    _user_id, _delta_points, _event_type, _reason, _order_id, _subtotal_cents, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _ledger_id;

  -- Update balances. Lifetime only counts positive earns.
  UPDATE public.loyalty_accounts
  SET
    points_balance = points_balance + _delta_points,
    lifetime_points_earned = lifetime_points_earned + GREATEST(0, _delta_points),
    updated_at = now()
  WHERE user_id = _user_id;

  RETURN _ledger_id;
END;
$$;

-- loyalty_accounts has no INSERT/UPDATE policies — the function uses SECURITY
-- DEFINER to bypass RLS, which is the intended design (clients can never write).

-- Make sure the unique constraint exists for the ON CONFLICT above.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loyalty_accounts_user_id_key'
  ) THEN
    BEGIN
      ALTER TABLE public.loyalty_accounts ADD CONSTRAINT loyalty_accounts_user_id_key UNIQUE (user_id);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END;
  END IF;
END$$;
