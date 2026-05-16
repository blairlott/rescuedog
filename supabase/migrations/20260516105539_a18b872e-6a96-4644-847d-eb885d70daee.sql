-- 1. Make user_id nullable on welcome_email_schedule and replace unique constraint
ALTER TABLE public.welcome_email_schedule
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.welcome_email_schedule
  DROP CONSTRAINT IF EXISTS welcome_email_schedule_user_id_template_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS welcome_email_schedule_user_template_uniq
  ON public.welcome_email_schedule (user_id, template_name)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS welcome_email_schedule_email_template_uniq
  ON public.welcome_email_schedule (lower(email), template_name)
  WHERE user_id IS NULL;

-- 2. Create leads table for pre-account contacts
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  source text NOT NULL DEFAULT 'vinoshipper_webhook',
  vinoshipper_customer_id text,
  vinoshipper_created_at timestamptz,
  welcome_series_started_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_email_uniq ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_vs_customer_idx ON public.leads (vinoshipper_customer_id);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage leads"
  ON public.leads
  FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE POLICY "Sales team view leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (is_sales_team(auth.uid()));

CREATE POLICY "Sales team update leads"
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (is_sales_team(auth.uid()))
  WITH CHECK (is_sales_team(auth.uid()));

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Updated enqueue_welcome_series — accepts either user_id or email-only
CREATE OR REPLACE FUNCTION public.enqueue_welcome_series(
  _user_id uuid,
  _email text,
  _vinoshipper_created_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _launch_cutoff constant timestamptz := '2026-07-01T00:00:00Z';
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN;
  END IF;

  -- Legacy guard: anyone in Vinoshipper before launch is silently skipped.
  IF _vinoshipper_created_at IS NOT NULL AND _vinoshipper_created_at < _launch_cutoff THEN
    RETURN;
  END IF;

  -- Suppression: if the email has already been queued (by user_id or by email-only),
  -- ON CONFLICT on the partial unique indexes will silently skip duplicates.
  INSERT INTO public.welcome_email_schedule (user_id, email, template_name, step_index, send_at)
  VALUES
    (_user_id, _email, 'welcome-1-story',   1, now()),
    (_user_id, _email, 'welcome-2-sampler', 2, now() + interval '2 days'),
    (_user_id, _email, 'welcome-3-reviews', 3, now() + interval '5 days'),
    (_user_id, _email, 'welcome-4-mission', 4, now() + interval '9 days'),
    (_user_id, _email, 'welcome-5-nudge',   5, now() + interval '14 days')
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 4. Update handle_new_user to match new signature (3rd arg defaults to NULL)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _full_name text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, _full_name);

  BEGIN
    PERFORM public.enqueue_welcome_series(NEW.id, NEW.email, NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'welcome series enqueue failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;