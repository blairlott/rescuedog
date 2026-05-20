INSERT INTO public.app_settings (key, value) VALUES
  ('instacart_autopilot_enabled', 'false'::jsonb),
  ('instacart_autopilot_confidence_min', '0.75'::jsonb),
  ('instacart_autopilot_max_bid_change_pct', '25'::jsonb),
  ('instacart_autopilot_daily_action_cap', '20'::jsonb),
  ('instacart_autopilot_allowed_actions', '["raise_bid","lower_bid","pause","add_negative"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE VIEW public.v_instacart_recommendations AS
SELECT r.*
FROM public.ad_recommendations r
WHERE r.payload->>'platform' = 'instacart'
   OR r.title ILIKE '%instacart%';

GRANT SELECT ON public.v_instacart_recommendations TO authenticated;