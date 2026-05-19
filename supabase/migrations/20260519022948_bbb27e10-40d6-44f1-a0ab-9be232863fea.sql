
CREATE TABLE IF NOT EXISTS public.kennel_bid_modifiers (
  day_of_week smallint PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  modifier numeric(5,3) NOT NULL DEFAULT 1.000,
  sample_avg_revenue_cents bigint,
  sample_days integer,
  source_window_days integer NOT NULL DEFAULT 90,
  notes text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kennel_bid_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel viewers can read bid modifiers"
  ON public.kennel_bid_modifiers FOR SELECT TO authenticated
  USING (public.can_view_kennel(auth.uid()));

-- Writes are service-role only (no policy = denied for authenticated).

CREATE TRIGGER kennel_bid_modifiers_updated_at
  BEFORE UPDATE ON public.kennel_bid_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with neutral 1.0 so UI has rows before first compute.
INSERT INTO public.kennel_bid_modifiers (day_of_week, modifier, notes)
SELECT g, 1.000, 'seed — awaiting first compute'
FROM generate_series(0,6) g
ON CONFLICT (day_of_week) DO NOTHING;
