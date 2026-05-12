
ALTER TABLE public.merch_products
  ADD COLUMN IF NOT EXISTS vinoshipper_product_id TEXT,
  ADD COLUMN IF NOT EXISTS vinoshipper_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_merch_products_vs_id
  ON public.merch_products(vinoshipper_product_id)
  WHERE vinoshipper_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vinoshipper_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  subject TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  dropship_order_ids UUID[] DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vs_webhook_subject_event ON public.vinoshipper_webhook_events(subject, event);
CREATE INDEX IF NOT EXISTS idx_vs_webhook_identifier ON public.vinoshipper_webhook_events(identifier);
CREATE INDEX IF NOT EXISTS idx_vs_webhook_unprocessed ON public.vinoshipper_webhook_events(processed) WHERE processed = false;

ALTER TABLE public.vinoshipper_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view vs webhook events"
  ON public.vinoshipper_webhook_events FOR SELECT
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR is_dropship_manager(auth.uid()));
