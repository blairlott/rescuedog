
CREATE TABLE public.ad_guardrails (
  channel_id uuid PRIMARY KEY REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  daily_spend_cap_cents integer NOT NULL DEFAULT 100000,
  max_bid_change_pct numeric(5,2) NOT NULL DEFAULT 25.00,
  max_budget_change_pct numeric(5,2) NOT NULL DEFAULT 30.00,
  paused boolean NOT NULL DEFAULT false,
  pause_window text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel_guardrails_select" ON public.ad_guardrails FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "kennel_guardrails_admin_write" ON public.ad_guardrails FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));
CREATE TRIGGER ad_guardrails_updated_at BEFORE UPDATE ON public.ad_guardrails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed guardrails for existing channels
INSERT INTO public.ad_guardrails (channel_id)
  SELECT id FROM public.ad_channels ON CONFLICT DO NOTHING;

CREATE TABLE public.ad_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE CASCADE,
  date date NOT NULL,
  metric text NOT NULL CHECK (metric IN ('spend','revenue','conversions','clicks','impressions')),
  lindy_value numeric(14,4),
  native_value numeric(14,4),
  variance_pct numeric(8,3),
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_reconciliation_log_recent ON public.ad_reconciliation_log(date DESC, flagged DESC);
ALTER TABLE public.ad_reconciliation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kennel_recon_select" ON public.ad_reconciliation_log FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "kennel_recon_service_write" ON public.ad_reconciliation_log FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
