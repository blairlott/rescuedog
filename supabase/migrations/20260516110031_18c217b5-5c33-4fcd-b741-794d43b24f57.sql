CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settings"
ON public.app_settings FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settings"
ON public.app_settings FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value)
VALUES ('welcome_series_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enqueue_welcome_series(_user_id uuid, _email text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enabled BOOLEAN;
  _launch_cutoff TIMESTAMPTZ := '2026-07-01T00:00:00Z';
  _resolved_email TEXT;
BEGIN
  IF now() < _launch_cutoff THEN
    RETURN;
  END IF;

  SELECT COALESCE((value)::boolean, true) INTO _enabled
  FROM public.app_settings WHERE key = 'welcome_series_enabled';
  IF _enabled IS FALSE THEN
    RETURN;
  END IF;

  _resolved_email := _email;
  IF _resolved_email IS NULL AND _user_id IS NOT NULL THEN
    SELECT email INTO _resolved_email FROM auth.users WHERE id = _user_id;
  END IF;

  IF _resolved_email IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.welcome_email_schedule (user_id, email, template_name, send_at, status)
  VALUES
    (_user_id, _resolved_email, 'welcome_1_intro',        now(),                    'pending'),
    (_user_id, _resolved_email, 'welcome_2_story',        now() + interval '2 days','pending'),
    (_user_id, _resolved_email, 'welcome_3_wines',        now() + interval '4 days','pending'),
    (_user_id, _resolved_email, 'welcome_4_club',         now() + interval '7 days','pending'),
    (_user_id, _resolved_email, 'welcome_5_invitation',   now() + interval '10 days','pending')
  ON CONFLICT DO NOTHING;
END;
$$;