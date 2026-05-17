
CREATE TABLE public.pending_merch_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  checkout_url TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','emailed','expired')),
  wine_order_id TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_merch_handoffs_status_created
  ON public.pending_merch_handoffs(status, created_at);
CREATE INDEX idx_pending_merch_handoffs_user
  ON public.pending_merch_handoffs(user_id);

ALTER TABLE public.pending_merch_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pending handoffs"
  ON public.pending_merch_handoffs FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "Users insert own pending handoffs"
  ON public.pending_merch_handoffs FOR INSERT
  WITH CHECK (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR (auth.uid() = user_id)
  );

CREATE POLICY "Users update own pending handoffs"
  ON public.pending_merch_handoffs FOR UPDATE
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE TRIGGER update_pending_merch_handoffs_updated_at
  BEFORE UPDATE ON public.pending_merch_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
