INSERT INTO public.app_settings (key, value)
VALUES
  ('abandoned_cart_enabled', 'true'::jsonb),
  ('mailchimp_wine_club_sync_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;