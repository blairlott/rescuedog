-- Add 'pushed_back' status for drafts kicked back to Lindy
ALTER TABLE public.lindy_inbox DROP CONSTRAINT IF EXISTS lindy_inbox_status_check;
ALTER TABLE public.lindy_inbox ADD CONSTRAINT lindy_inbox_status_check
  CHECK (status = ANY (ARRAY['pending'::text,'approved'::text,'rejected'::text,'promoted'::text,'error'::text,'pushed_back'::text]));

-- Settings row used by the trigger; default OFF so behavior doesn't change until you flip it
INSERT INTO public.app_settings (key, value)
VALUES ('lindy_auto_approve_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('lindy_auto_approve_min_confidence', '"medium"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Trigger: on INSERT of a pending draft, auto-approve when confidence meets the bar
CREATE OR REPLACE FUNCTION public.lindy_inbox_auto_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enabled boolean;
  _min text;
  _ok boolean := false;
BEGIN
  IF NEW.status <> 'pending' OR NEW.confidence IS NULL THEN RETURN NEW; END IF;

  SELECT (value)::text::boolean INTO _enabled
  FROM public.app_settings WHERE key = 'lindy_auto_approve_enabled';
  IF _enabled IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT trim(both '"' from (value)::text) INTO _min
  FROM public.app_settings WHERE key = 'lindy_auto_approve_min_confidence';
  _min := COALESCE(_min, 'medium');

  IF _min = 'high'   AND NEW.confidence = 'high' THEN _ok := true; END IF;
  IF _min = 'medium' AND NEW.confidence IN ('high','medium') THEN _ok := true; END IF;
  IF _min = 'low'    AND NEW.confidence IN ('high','medium','low') THEN _ok := true; END IF;

  IF _ok THEN
    NEW.status := 'approved';
    NEW.reviewed_at := now();
    NEW.reviewer_notes := COALESCE(NEW.reviewer_notes,'') || '[auto-approved: confidence=' || NEW.confidence || ']';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lindy_inbox_auto_approve_trg ON public.lindy_inbox;
CREATE TRIGGER lindy_inbox_auto_approve_trg
BEFORE INSERT ON public.lindy_inbox
FOR EACH ROW EXECUTE FUNCTION public.lindy_inbox_auto_approve();