
CREATE TYPE public.discount_type AS ENUM ('percent', 'fixed', 'shipping');
CREATE TYPE public.discount_scope AS ENUM ('sitewide', 'wine', 'merch', 'sku_list', 'collection');
CREATE TYPE public.discount_tier AS ENUM ('public', 'club_member', 'ambassador', 'vip', 'staff');
CREATE TYPE public.mirror_status AS ENUM ('pending', 'synced', 'failed', 'disabled');

CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type public.discount_type NOT NULL,
  value NUMERIC(10,2) NOT NULL,
  scope public.discount_scope NOT NULL DEFAULT 'sitewide',
  scope_ids TEXT[] DEFAULT '{}',
  tier public.discount_tier NOT NULL DEFAULT 'public',
  min_subtotal_cents INTEGER DEFAULT 0,
  max_discount_cents INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit_total INTEGER,
  usage_limit_per_customer INTEGER DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  customer_eligibility TEXT NOT NULL DEFAULT 'all',
  required_role TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  shopify_price_rule_id BIGINT,
  shopify_discount_code_id BIGINT,
  shopify_mirror_status public.mirror_status DEFAULT 'pending',
  shopify_mirror_error TEXT,
  vs_mirror_status public.mirror_status DEFAULT 'pending',
  vs_mirror_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discount_codes_code ON public.discount_codes(upper(code));
CREATE INDEX idx_discount_codes_active ON public.discount_codes(active) WHERE active = true;

CREATE TABLE public.discount_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id UUID NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT,
  order_reference TEXT,
  rail TEXT NOT NULL,
  amount_applied_cents INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_redemptions_code ON public.discount_redemptions(discount_code_id);
CREATE INDEX idx_redemptions_user ON public.discount_redemptions(user_id);

ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active codes"
  ON public.discount_codes FOR SELECT
  USING (active = true);

CREATE POLICY "Admins manage discount codes"
  ON public.discount_codes FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Users see own redemptions"
  ON public.discount_redemptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Service role inserts redemptions"
  ON public.discount_redemptions FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER trg_discount_codes_updated_at
  BEFORE UPDATE ON public.discount_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_discount_code(
  _code TEXT,
  _subtotal_cents INTEGER,
  _rail TEXT,
  _user_id UUID DEFAULT NULL
) RETURNS TABLE (
  valid BOOLEAN,
  reason TEXT,
  discount_code_id UUID,
  discount_cents INTEGER,
  type public.discount_type,
  scope public.discount_scope
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _dc public.discount_codes;
  _used INTEGER;
  _discount INTEGER;
BEGIN
  SELECT * INTO _dc FROM public.discount_codes
   WHERE upper(code) = upper(_code) AND active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Code not found', NULL::uuid, 0, NULL::discount_type, NULL::discount_scope; RETURN;
  END IF;
  IF _dc.starts_at IS NOT NULL AND now() < _dc.starts_at THEN
    RETURN QUERY SELECT false, 'Not yet active', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _dc.ends_at IS NOT NULL AND now() > _dc.ends_at THEN
    RETURN QUERY SELECT false, 'Expired', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _dc.min_subtotal_cents > 0 AND _subtotal_cents < _dc.min_subtotal_cents THEN
    RETURN QUERY SELECT false, 'Minimum subtotal not met', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _dc.scope = 'wine' AND _rail <> 'wine' THEN
    RETURN QUERY SELECT false, 'Wine only', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _dc.scope = 'merch' AND _rail <> 'merch' THEN
    RETURN QUERY SELECT false, 'Merch only', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _dc.usage_limit_total IS NOT NULL AND _dc.usage_count >= _dc.usage_limit_total THEN
    RETURN QUERY SELECT false, 'Usage limit reached', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;
  IF _user_id IS NOT NULL AND _dc.usage_limit_per_customer IS NOT NULL THEN
    SELECT COUNT(*) INTO _used FROM public.discount_redemptions
     WHERE discount_code_id = _dc.id AND user_id = _user_id;
    IF _used >= _dc.usage_limit_per_customer THEN
      RETURN QUERY SELECT false, 'Already redeemed', _dc.id, 0, _dc.type, _dc.scope; RETURN;
    END IF;
  END IF;
  IF _dc.customer_eligibility = 'logged_in' AND _user_id IS NULL THEN
    RETURN QUERY SELECT false, 'Sign in required', _dc.id, 0, _dc.type, _dc.scope; RETURN;
  END IF;

  IF _dc.type = 'percent' THEN
    _discount := FLOOR(_subtotal_cents * (_dc.value / 100.0))::int;
  ELSIF _dc.type = 'fixed' THEN
    _discount := LEAST((_dc.value * 100)::int, _subtotal_cents);
  ELSE
    _discount := 0;
  END IF;
  IF _dc.max_discount_cents IS NOT NULL THEN
    _discount := LEAST(_discount, _dc.max_discount_cents);
  END IF;

  RETURN QUERY SELECT true, NULL::text, _dc.id, _discount, _dc.type, _dc.scope;
END $$;
