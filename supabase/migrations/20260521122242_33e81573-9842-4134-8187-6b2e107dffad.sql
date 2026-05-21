
-- 1. State margin tiers
CREATE TABLE IF NOT EXISTS public.state_margin_tiers (
  state_code TEXT PRIMARY KEY,
  tier INTEGER NOT NULL CHECK (tier IN (1,2,3)),
  multiplier NUMERIC(3,2) NOT NULL CHECK (multiplier > 0),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.state_margin_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ad ops + execs can read state_margin_tiers"
ON public.state_margin_tiers FOR SELECT
USING (public.is_ad_ops(auth.uid()) OR public.is_executive(auth.uid()));

-- Seed all 50 states + DC
INSERT INTO public.state_margin_tiers (state_code, tier, multiplier, notes) VALUES
  ('CA',1,1.20,'High volume, low shipping'),
  ('TX',1,1.20,'High volume, good margins'),
  ('FL',1,1.20,'High volume market'),
  ('NY',1,1.20,'Premium market'),
  ('WA',1,1.20,'Wine-friendly, local'),
  ('CO',1,1.20,'Good AOV'),
  ('IL',1,1.20,'Strong metro market'),
  ('GA',1,1.20,'Home state, strong ROAS'),
  ('MT',3,0.80,'High shipping cost'),
  ('WY',3,0.80,'High shipping cost'),
  ('ND',3,0.80,'Low volume, high shipping'),
  ('SD',3,0.80,'Low volume, high shipping'),
  ('ID',3,0.80,'High shipping cost'),
  ('AK',3,0.80,'Extreme shipping cost'),
  -- Tier 2 default for everyone else
  ('AL',2,1.00,NULL),('AR',2,1.00,NULL),('AZ',2,1.00,NULL),('CT',2,1.00,NULL),
  ('DC',2,1.00,NULL),('DE',2,1.00,NULL),('HI',2,1.00,NULL),('IA',2,1.00,NULL),
  ('IN',2,1.00,NULL),('KS',2,1.00,NULL),('KY',2,1.00,NULL),('LA',2,1.00,NULL),
  ('MA',2,1.00,NULL),('MD',2,1.00,NULL),('ME',2,1.00,NULL),('MI',2,1.00,NULL),
  ('MN',2,1.00,NULL),('MO',2,1.00,NULL),('MS',2,1.00,NULL),('NC',2,1.00,NULL),
  ('NE',2,1.00,NULL),('NH',2,1.00,NULL),('NJ',2,1.00,NULL),('NM',2,1.00,NULL),
  ('NV',2,1.00,NULL),('OH',2,1.00,NULL),('OK',2,1.00,NULL),('OR',2,1.00,NULL),
  ('PA',2,1.00,NULL),('RI',2,1.00,NULL),('SC',2,1.00,NULL),('TN',2,1.00,NULL),
  ('UT',2,1.00,NULL),('VA',2,1.00,NULL),('VT',2,1.00,NULL),('WI',2,1.00,NULL),
  ('WV',2,1.00,NULL)
ON CONFLICT (state_code) DO NOTHING;

-- 2. Extend meta_capi_events with weighting metadata
ALTER TABLE public.meta_capi_events
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS raw_value_cents INTEGER,
  ADD COLUMN IF NOT EXISTS multiplier NUMERIC(3,2);

-- 3. Register high-margin Tier-1 audience for monthly push
INSERT INTO public.meta_audiences (
  segment_key, segment_name, segment_kind, segment_query,
  sync_cadence, create_lal, lal_ratio, enabled, notes
) VALUES (
  'highmargin_tier1',
  'customerswithvalue_highmargin',
  'user_list',
  $q$
    SELECT
      lower(customer_email) AS email,
      customer_first_name   AS first_name,
      customer_last_name    AS last_name,
      customer_phone        AS phone,
      ship_to_city          AS city,
      ship_to_state         AS state,
      ship_to_zip           AS zip
    FROM public.vs_transactions
    WHERE upper(ship_to_state) IN ('CA','TX','FL','NY','WA','CO','IL','GA')
      AND customer_email IS NOT NULL
      AND transaction_date >= (now() - interval '365 days')::date
  $q$,
  'monthly', true, 0.01, true,
  'Tier 1 (1.20x multiplier) buyers — primary LAL seed audience'
)
ON CONFLICT (segment_key) DO UPDATE
  SET segment_query = EXCLUDED.segment_query,
      segment_name  = EXCLUDED.segment_name,
      sync_cadence  = EXCLUDED.sync_cadence,
      create_lal    = EXCLUDED.create_lal,
      notes         = EXCLUDED.notes,
      enabled       = true;

-- 4. Schedule monthly audience refresh (1st of month, 09:00 UTC)
DO $$
DECLARE
  _existing INTEGER;
BEGIN
  SELECT jobid INTO _existing FROM cron.job WHERE jobname = 'meta-audience-sync-monthly';
  IF _existing IS NOT NULL THEN
    PERFORM cron.unschedule(_existing);
  END IF;
END $$;

SELECT cron.schedule(
  'meta-audience-sync-monthly',
  '0 9 1 * *',
  $$
  select net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/meta-audience-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVza3FheG15cGd2d3RzZmZjYnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NjM2OTUsImV4cCI6MjA5MDAzOTY5NX0.cdmdOmmLFahgp35l09wmkuPlUgnpvpdHjdmWHH35sBs'
    ),
    body := jsonb_build_object('cadence','monthly')
  );
  $$
);
