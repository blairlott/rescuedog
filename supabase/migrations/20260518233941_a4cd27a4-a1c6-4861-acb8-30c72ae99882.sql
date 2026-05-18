
CREATE TABLE IF NOT EXISTS public.ad_frequency_rollup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  impressions_7d bigint NOT NULL DEFAULT 0,
  conversions_7d integer NOT NULL DEFAULT 0,
  impressions_30d bigint NOT NULL DEFAULT 0,
  conversions_30d integer NOT NULL DEFAULT 0,
  imp_per_conv_7d numeric(12,2),
  imp_per_conv_30d numeric(12,2),
  saturation_score numeric(4,3) NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, campaign_id)
);
ALTER TABLE public.ad_frequency_rollup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_freq_rollup_select" ON public.ad_frequency_rollup FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad_freq_rollup_service_write" ON public.ad_frequency_rollup
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.weather_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dma text NOT NULL,
  region text,
  forecast_date date NOT NULL,
  max_temp_f numeric(5,1),
  min_temp_f numeric(5,1),
  condition text,
  signal_kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dma, forecast_date, signal_kind)
);
ALTER TABLE public.weather_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weather_signals_select" ON public.weather_signals FOR SELECT USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "weather_signals_service_write" ON public.weather_signals
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
