INSERT INTO public.feature_flags (key, enabled, description, audience)
VALUES (
  'rewards_test_mode',
  true,
  'When ON, Rescue Rewards shows the Simulate Purchase panel and labels redemptions as test. When OFF, only real Vinoshipper webhook earns appear (Production mode).',
  'admin'
)
ON CONFLICT (key) DO NOTHING;