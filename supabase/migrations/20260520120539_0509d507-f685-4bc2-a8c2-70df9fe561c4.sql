
CREATE TABLE IF NOT EXISTS public.kennel_self_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  status_code integer,
  ok boolean NOT NULL,
  latency_ms integer,
  error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  alert_fired boolean NOT NULL DEFAULT false
);
ALTER TABLE public.kennel_self_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad ops read self health"
  ON public.kennel_self_health FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE INDEX idx_self_health_fn_time ON public.kennel_self_health (function_name, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.kennel_rule_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  source_window_days integer NOT NULL DEFAULT 30,
  title text NOT NULL,
  rationale text NOT NULL,
  proposed_rule jsonb NOT NULL,
  evidence jsonb,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','implemented')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kennel_rule_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad ops read rule suggestions"
  ON public.kennel_rule_suggestions FOR SELECT
  USING (public.is_ad_ops(auth.uid()));
CREATE POLICY "ad ops update rule suggestions"
  ON public.kennel_rule_suggestions FOR UPDATE
  USING (public.is_ad_ops(auth.uid()));
CREATE TRIGGER trg_rule_suggestions_updated_at
  BEFORE UPDATE ON public.kennel_rule_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_rule_suggestions_status ON public.kennel_rule_suggestions (status, proposed_at DESC);
