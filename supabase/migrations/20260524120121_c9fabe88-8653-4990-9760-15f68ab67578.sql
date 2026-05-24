
-- Dedup table for gclid → VS purchase OCI uploads
CREATE TABLE IF NOT EXISTS public.oci_gclid_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid REFERENCES public.ab_checkout_intents(id) ON DELETE SET NULL,
  invoice text NOT NULL,
  email text,
  gclid text NOT NULL,
  conversion_value numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  conversion_action_id text,
  status text NOT NULL DEFAULT 'pending', -- pending|uploaded|error|skipped
  error_message text,
  matched_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  UNIQUE (invoice, gclid)
);

ALTER TABLE public.oci_gclid_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read oci_gclid_matches"
  ON public.oci_gclid_matches FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_oci_gclid_matches_status ON public.oci_gclid_matches(status);
CREATE INDEX IF NOT EXISTS idx_oci_gclid_matches_matched_at ON public.oci_gclid_matches(matched_at DESC);
