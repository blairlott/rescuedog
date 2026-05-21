
CREATE TABLE IF NOT EXISTS public.event_rsvp_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id uuid NOT NULL REFERENCES public.ambassador_event_rsvps(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  email text NOT NULL,
  kind text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rsvp_id, kind)
);
CREATE INDEX IF NOT EXISTS event_rsvp_email_log_event_idx ON public.event_rsvp_email_log (event_id, kind);
ALTER TABLE public.event_rsvp_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_email_log_admin_read" ON public.event_rsvp_email_log
  FOR SELECT USING (public.is_admin_or_owner(auth.uid()) OR public.is_ambassador_manager(auth.uid()));

INSERT INTO public.app_settings (key, value) VALUES
  ('referral_default_points', '100'::jsonb),
  ('event_reminder_enabled', 'true'::jsonb),
  ('event_rsvp_confirmation_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

SELECT cron.schedule(
  'event-reminder-sweep-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/event-reminder-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', current_setting('app.settings.service_role_key', true))
  );
  $$
);
