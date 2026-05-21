
-- Default welcome series OFF
UPDATE public.app_settings
  SET value = 'false'::jsonb, updated_at = now()
  WHERE key = 'welcome_series_enabled';

INSERT INTO public.app_settings (key, value)
  VALUES ('welcome_series_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Editable overrides for transactional email templates
CREATE TABLE IF NOT EXISTS public.email_template_overrides (
  template_name text PRIMARY KEY,
  subject text,
  body_html text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.email_template_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email overrides"
  ON public.email_template_overrides FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert email overrides"
  ON public.email_template_overrides FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update email overrides"
  ON public.email_template_overrides FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete email overrides"
  ON public.email_template_overrides FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_email_template_overrides()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_email_template_overrides ON public.email_template_overrides;
CREATE TRIGGER trg_touch_email_template_overrides
  BEFORE UPDATE ON public.email_template_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_email_template_overrides();
