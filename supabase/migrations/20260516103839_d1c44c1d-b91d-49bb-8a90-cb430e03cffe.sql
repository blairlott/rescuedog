CREATE TABLE IF NOT EXISTS public.welcome_email_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  template_name text NOT NULL,
  step_index smallint NOT NULL,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  attempts smallint NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_name)
);

CREATE INDEX IF NOT EXISTS welcome_email_schedule_due_idx
  ON public.welcome_email_schedule (send_at)
  WHERE status = 'pending';

ALTER TABLE public.welcome_email_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view welcome email schedule"
  ON public.welcome_email_schedule FOR SELECT
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_welcome_series(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR length(trim(_email)) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.welcome_email_schedule (user_id, email, template_name, step_index, send_at)
  VALUES
    (_user_id, _email, 'welcome-1-story',   1, now()),
    (_user_id, _email, 'welcome-2-sampler', 2, now() + interval '2 days'),
    (_user_id, _email, 'welcome-3-reviews', 3, now() + interval '5 days'),
    (_user_id, _email, 'welcome-4-mission', 4, now() + interval '9 days'),
    (_user_id, _email, 'welcome-5-nudge',   5, now() + interval '14 days')
  ON CONFLICT (user_id, template_name) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name text;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, _full_name);

  BEGIN
    PERFORM public.enqueue_welcome_series(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'welcome series enqueue failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;