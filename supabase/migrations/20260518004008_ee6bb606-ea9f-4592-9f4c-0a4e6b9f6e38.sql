-- 1. VS tracking relay log
CREATE TABLE public.vs_tracking_relay_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dropship_order_id UUID REFERENCES public.dropship_orders(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.dropship_partners(id) ON DELETE SET NULL,
  vinoshipper_order_id TEXT,
  tracking_number TEXT,
  carrier TEXT,
  attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  http_status INTEGER,
  relay_ok BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verified_ok BOOLEAN,
  mismatch_reason TEXT,
  request_payload JSONB,
  response_payload JSONB,
  simulated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vs_relay_order ON public.vs_tracking_relay_log(dropship_order_id);
CREATE INDEX idx_vs_relay_attempt ON public.vs_tracking_relay_log(attempt_at DESC);
CREATE INDEX idx_vs_relay_mismatch ON public.vs_tracking_relay_log(verified_ok) WHERE verified_ok = false;

ALTER TABLE public.vs_tracking_relay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dropship managers read VS relay log"
  ON public.vs_tracking_relay_log FOR SELECT
  TO authenticated
  USING (public.is_dropship_manager(auth.uid()));

CREATE POLICY "Dropship managers insert VS relay log"
  ON public.vs_tracking_relay_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_dropship_manager(auth.uid()));

CREATE POLICY "Dropship managers update VS relay log"
  ON public.vs_tracking_relay_log FOR UPDATE
  TO authenticated
  USING (public.is_dropship_manager(auth.uid()))
  WITH CHECK (public.is_dropship_manager(auth.uid()));

-- 2. Tracking verification fields on dropship_orders
ALTER TABLE public.dropship_orders
  ADD COLUMN IF NOT EXISTS vs_tracking_relayed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vs_tracking_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vs_tracking_mismatch TEXT;

CREATE INDEX IF NOT EXISTS idx_dropship_orders_vs_mismatch
  ON public.dropship_orders(vs_tracking_mismatch)
  WHERE vs_tracking_mismatch IS NOT NULL;

-- 3. Partner health-check fields
ALTER TABLE public.dropship_partners
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_status TEXT;
