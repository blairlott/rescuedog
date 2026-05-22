ALTER TABLE public.vinoshipper_webhook_events
  ADD COLUMN IF NOT EXISTS raw_body TEXT,
  ADD COLUMN IF NOT EXISTS signature_header TEXT,
  ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN,
  ADD COLUMN IF NOT EXISTS source_ip TEXT,
  ADD COLUMN IF NOT EXISTS related_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_cycle_id UUID REFERENCES public.subscription_cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vs_webhook_subject_event ON public.vinoshipper_webhook_events(subject, event);
CREATE INDEX IF NOT EXISTS idx_vs_webhook_identifier ON public.vinoshipper_webhook_events(identifier);
CREATE INDEX IF NOT EXISTS idx_vs_webhook_received ON public.vinoshipper_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_webhook_unprocessed ON public.vinoshipper_webhook_events(received_at)
  WHERE processed = false;