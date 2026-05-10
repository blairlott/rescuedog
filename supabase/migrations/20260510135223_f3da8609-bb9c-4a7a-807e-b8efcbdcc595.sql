CREATE TABLE public.vinoshipper_webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject text NOT NULL,
  event text NOT NULL,
  identifier text NOT NULL,
  payload jsonb NOT NULL,
  headers jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  notes text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_vs_webhook_logs_identifier ON public.vinoshipper_webhook_logs (identifier);
CREATE INDEX idx_vs_webhook_logs_subject_event ON public.vinoshipper_webhook_logs (subject, event);
CREATE INDEX idx_vs_webhook_logs_received_at ON public.vinoshipper_webhook_logs (received_at DESC);

ALTER TABLE public.vinoshipper_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers can view webhook logs"
ON public.vinoshipper_webhook_logs
FOR SELECT
TO authenticated
USING (public.is_wine_club_manager(auth.uid()));
