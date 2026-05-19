CREATE TABLE public.ab_checkout_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  cart_id TEXT,
  site_variant TEXT NOT NULL CHECK (site_variant IN ('lovable','legacy')),
  ab_test TEXT NOT NULL,
  ga4_client_id TEXT,
  gclid TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ab_checkout_intents_email_created ON public.ab_checkout_intents (email, created_at DESC);
CREATE INDEX idx_ab_checkout_intents_created ON public.ab_checkout_intents (created_at DESC);

ALTER TABLE public.ab_checkout_intents ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can record their own checkout intent.
-- This is write-only telemetry — no PII beyond what they're about to submit to Vinoshipper.
CREATE POLICY "Anyone can record checkout intent"
  ON public.ab_checkout_intents
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins/owners can read intents (for QA + analytics).
CREATE POLICY "Admins can read checkout intents"
  ON public.ab_checkout_intents
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));