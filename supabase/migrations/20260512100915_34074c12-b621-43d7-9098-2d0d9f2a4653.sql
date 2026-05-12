
-- 1. Shipment lifecycle columns
ALTER TABLE public.wine_club_shipments
  ADD COLUMN IF NOT EXISTS cutoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS weather_hold_state text,
  ADD COLUMN IF NOT EXISTS weather_hold_until date,
  ADD COLUMN IF NOT EXISTS weather_hold_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_destination_type text NOT NULL DEFAULT 'address',
  ADD COLUMN IF NOT EXISTS delivery_ups_access_point jsonb,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_error text,
  ADD COLUMN IF NOT EXISTS curation_run_id uuid;

ALTER TABLE public.wine_club_shipments
  DROP CONSTRAINT IF EXISTS wine_club_shipments_destination_check;
ALTER TABLE public.wine_club_shipments
  ADD CONSTRAINT wine_club_shipments_destination_check
  CHECK (delivery_destination_type IN ('address','ups_access_point'));

CREATE INDEX IF NOT EXISTS idx_wine_club_shipments_status_date
  ON public.wine_club_shipments(status, shipment_date);

-- 2. Curation runs + picks
CREATE TABLE IF NOT EXISTS public.wine_club_curation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  ship_window_start date NOT NULL,
  ship_window_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved','published','cancelled')),
  created_by uuid,
  approved_by uuid,
  ai_model text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wine_club_curation_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.wine_club_curation_runs(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.wine_club_tiers(id) ON DELETE CASCADE,
  wine_product_id uuid REFERENCES public.wine_products(id),
  product_handle text NOT NULL,
  product_title text NOT NULL,
  product_image_url text,
  price_cents integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  role text DEFAULT 'hero' CHECK (role IN ('hero','pairing','stretch')),
  ai_rationale text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wine_club_curation_picks_run_tier
  ON public.wine_club_curation_picks(run_id, tier_id);

ALTER TABLE public.wine_club_curation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wine_club_curation_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers manage curation runs"
ON public.wine_club_curation_runs FOR ALL TO authenticated
USING (public.is_wine_club_manager(auth.uid()))
WITH CHECK (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers manage curation picks"
ON public.wine_club_curation_picks FOR ALL TO authenticated
USING (public.is_wine_club_manager(auth.uid()))
WITH CHECK (public.is_wine_club_manager(auth.uid()));

-- 3. Weather holds
CREATE TABLE IF NOT EXISTS public.wine_club_weather_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  hold_until date NOT NULL,
  severity text NOT NULL DEFAULT 'heat' CHECK (severity IN ('heat','freeze','storm','other')),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  customer_notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_wine_club_weather_holds_state_active
  ON public.wine_club_weather_holds(state, hold_until)
  WHERE lifted_at IS NULL;

ALTER TABLE public.wine_club_weather_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active weather holds"
ON public.wine_club_weather_holds FOR SELECT TO anon, authenticated
USING (lifted_at IS NULL AND hold_until >= CURRENT_DATE);

CREATE POLICY "Wine club managers manage weather holds"
ON public.wine_club_weather_holds FOR ALL TO authenticated
USING (public.is_wine_club_manager(auth.uid()))
WITH CHECK (public.is_wine_club_manager(auth.uid()));

-- 4. Settings singleton
CREATE TABLE IF NOT EXISTS public.wine_club_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ship_dow integer NOT NULL DEFAULT 1, -- 0=Sun..6=Sat (Monday=1)
  cutoff_offset_days integer NOT NULL DEFAULT 1,
  preview_email_offset_days integer NOT NULL DEFAULT 6,
  dispatch_hour_local integer NOT NULL DEFAULT 7,
  timezone text NOT NULL DEFAULT 'America/New_York',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.wine_club_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.wine_club_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read wine club settings"
ON public.wine_club_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Wine club managers update settings"
ON public.wine_club_settings FOR UPDATE TO authenticated
USING (public.is_wine_club_manager(auth.uid()))
WITH CHECK (public.is_wine_club_manager(auth.uid()));

-- 5. Optional default UPS access point on profiles
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS default_ups_access_point jsonb;
