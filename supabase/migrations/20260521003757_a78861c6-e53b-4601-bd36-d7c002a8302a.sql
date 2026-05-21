
DROP FUNCTION IF EXISTS public.enqueue_welcome_series(uuid, text);
DROP FUNCTION IF EXISTS public.enqueue_welcome_series(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.enqueue_welcome_series(
  _user_id uuid,
  _email text,
  _vinoshipper_created_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enabled boolean;
  _resolved_email text := _email;
BEGIN
  SELECT COALESCE((value)::boolean, true) INTO _enabled
  FROM public.app_settings WHERE key = 'welcome_series_enabled';
  IF _enabled IS FALSE THEN RETURN; END IF;

  IF _vinoshipper_created_at IS NOT NULL THEN RETURN; END IF;

  IF _resolved_email IS NULL AND _user_id IS NOT NULL THEN
    SELECT email INTO _resolved_email FROM auth.users WHERE id = _user_id;
  END IF;
  IF _resolved_email IS NULL OR length(trim(_resolved_email)) = 0 THEN RETURN; END IF;

  INSERT INTO public.welcome_email_schedule (user_id, email, template_name, step_index, send_at)
  VALUES
    (_user_id, _resolved_email, 'welcome-1-story',   1, now()),
    (_user_id, _resolved_email, 'welcome-2-sampler', 2, now() + interval '2 days'),
    (_user_id, _resolved_email, 'welcome-3-reviews', 3, now() + interval '5 days'),
    (_user_id, _resolved_email, 'welcome-4-mission', 4, now() + interval '9 days'),
    (_user_id, _resolved_email, 'welcome-5-nudge',   5, now() + interval '14 days')
  ON CONFLICT DO NOTHING;
END;
$$;

INSERT INTO public.app_settings (key, value)
VALUES ('welcome_series_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.wine_club_cancellation_analytics AS
SELECT
  m.id AS membership_id,
  m.user_id,
  m.tier_id,
  t.name AS tier_name,
  m.joined_at,
  m.cancelled_at,
  m.cancellation_reason,
  m.cancellation_source,
  m.origin,
  m.is_legacy_member,
  EXTRACT(EPOCH FROM (m.cancelled_at - m.joined_at)) / 86400.0 AS tenure_days,
  date_trunc('month', m.cancelled_at) AS cancelled_month
FROM public.wine_club_memberships m
LEFT JOIN public.wine_club_tiers t ON t.id = m.tier_id
WHERE m.status = 'cancelled' AND m.cancelled_at IS NOT NULL;

GRANT SELECT ON public.wine_club_cancellation_analytics TO authenticated;
