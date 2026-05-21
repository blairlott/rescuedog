
-- Loyalty log per shipment (dedup)
CREATE TABLE IF NOT EXISTS public.wine_club_shipment_loyalty_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.wine_club_shipments(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  user_id uuid,
  points_awarded integer NOT NULL DEFAULT 0,
  subtotal_cents integer,
  status text NOT NULL DEFAULT 'awarded',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id)
);
ALTER TABLE public.wine_club_shipment_loyalty_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_log_admin_read" ON public.wine_club_shipment_loyalty_log
  FOR SELECT USING (public.is_wine_club_manager(auth.uid()));

-- Re-engagement log
CREATE TABLE IF NOT EXISTS public.reengagement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  customer_email text NOT NULL,
  segment text NOT NULL,
  tag text NOT NULL,
  channel text NOT NULL DEFAULT 'mailchimp',
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reengagement_log_email_idx ON public.reengagement_log (customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS reengagement_log_tag_idx ON public.reengagement_log (tag, created_at DESC);
ALTER TABLE public.reengagement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reengage_log_admin_read" ON public.reengagement_log
  FOR SELECT USING (public.is_wine_club_manager(auth.uid()));

-- Anniversary log
CREATE TABLE IF NOT EXISTS public.wine_club_anniversary_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.wine_club_memberships(id) ON DELETE CASCADE,
  user_id uuid,
  customer_email text,
  anniversary_year integer NOT NULL,
  years_with_club integer NOT NULL,
  bonus_points integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, anniversary_year)
);
ALTER TABLE public.wine_club_anniversary_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anniversary_log_admin_read" ON public.wine_club_anniversary_log
  FOR SELECT USING (public.is_wine_club_manager(auth.uid()));

-- Settings (kill switches)
INSERT INTO public.app_settings (key, value) VALUES
  ('wine_club_shipment_loyalty_enabled', 'true'::jsonb),
  ('reengagement_sweep_enabled', 'true'::jsonb),
  ('anniversary_sweep_enabled', 'true'::jsonb),
  ('anniversary_bonus_points_per_year', '100'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Cron jobs
SELECT cron.schedule(
  'reengagement-sweep-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/reengagement-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', current_setting('app.settings.service_role_key', true))
  );
  $$
);

SELECT cron.schedule(
  'anniversary-sweep-daily',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/anniversary-sweep',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', current_setting('app.settings.service_role_key', true))
  );
  $$
);
