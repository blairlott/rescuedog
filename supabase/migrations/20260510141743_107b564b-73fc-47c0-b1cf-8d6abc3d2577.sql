CREATE TABLE public.cart_abandonments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  email text NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_cents integer NOT NULL DEFAULT 0,
  total_bottles integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'opened',
  source text NOT NULL DEFAULT 'vs_checkout',
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cart_abandonments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record an abandonment"
  ON public.cart_abandonments
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owner can update own abandonment"
  ON public.cart_abandonments
  FOR UPDATE TO anon, authenticated
  USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins can view abandonments"
  ON public.cart_abandonments
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE INDEX idx_cart_abandonments_status_opened ON public.cart_abandonments(status, opened_at DESC);
CREATE INDEX idx_cart_abandonments_user ON public.cart_abandonments(user_id) WHERE user_id IS NOT NULL;