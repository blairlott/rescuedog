
CREATE TABLE public.vinoshipper_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  event TEXT NOT NULL,
  identifier TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_vs_webhook_subject_event ON public.vinoshipper_webhook_events(subject, event);
CREATE INDEX idx_vs_webhook_identifier ON public.vinoshipper_webhook_events(identifier);
CREATE INDEX idx_vs_webhook_received_at ON public.vinoshipper_webhook_events(received_at DESC);

ALTER TABLE public.vinoshipper_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers can view webhook events"
ON public.vinoshipper_webhook_events
FOR SELECT
TO authenticated
USING (public.is_wine_club_manager(auth.uid()));
