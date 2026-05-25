
CREATE OR REPLACE FUNCTION public.log_ab_event(
  _event_type text,
  _site_variant text,
  _ab_test text DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _path text DEFAULT NULL,
  _value_cents integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _event_type NOT IN ('pageview','add_to_cart') THEN RETURN; END IF;
  IF _site_variant NOT IN ('lovable','legacy') THEN RETURN; END IF;
  INSERT INTO public.ab_events (event_type, site_variant, ab_test, session_id, path, value_cents)
  VALUES (_event_type, _site_variant, _ab_test, _session_id, _path, _value_cents);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_ab_event(text, text, text, text, text, integer) TO anon, authenticated;
