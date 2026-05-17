
-- Ship 2: Meta CAPI event log
CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  event_name TEXT NOT NULL DEFAULT 'Purchase',
  event_id TEXT NOT NULL, -- = order_id, used by Meta for pixel/CAPI dedup
  value_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  test_mode BOOLEAN NOT NULL DEFAULT false,
  test_event_code TEXT,
  fbc TEXT,
  fbp TEXT,
  email_hash TEXT,
  request_payload JSONB,
  response_status INTEGER,
  response_body JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_events_order_id ON public.meta_capi_events(order_id);
CREATE INDEX IF NOT EXISTS idx_meta_capi_events_sent_at ON public.meta_capi_events(sent_at DESC);
-- One non-test successful send per order: prevents accidental duplicate fires
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_capi_events_order_live_success
  ON public.meta_capi_events(order_id)
  WHERE test_mode = false AND success = true;

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops can view capi events"
  ON public.meta_capi_events FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

-- No INSERT/UPDATE/DELETE policies → only service role writes.

-- Feature flags
INSERT INTO public.app_settings (key, value)
VALUES
  ('kennel_capi_enabled', 'true'::jsonb),
  ('kennel_oci_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
