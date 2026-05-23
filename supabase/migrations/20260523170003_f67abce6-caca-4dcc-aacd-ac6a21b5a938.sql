-- MABWiser Phase 1: bandit_arms, bandit_rewards, bandit_state
CREATE TABLE IF NOT EXISTS public.bandit_arms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arm_key TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'meta',
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  exposures INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,
  reward_value NUMERIC NOT NULL DEFAULT 0,
  last_reward_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, arm_key)
);

CREATE TABLE IF NOT EXISTS public.bandit_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arm_id UUID NOT NULL REFERENCES public.bandit_arms(id) ON DELETE CASCADE,
  reward NUMERIC NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bandit_rewards_arm_observed ON public.bandit_rewards(arm_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.bandit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy TEXT NOT NULL DEFAULT 'linucb',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bandit_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bandit_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bandit_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel viewers read bandit_arms" ON public.bandit_arms FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write bandit_arms" ON public.bandit_arms FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "kennel viewers read bandit_rewards" ON public.bandit_rewards FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write bandit_rewards" ON public.bandit_rewards FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE POLICY "kennel viewers read bandit_state" ON public.bandit_state FOR SELECT USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_ops write bandit_state" ON public.bandit_state FOR ALL USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

CREATE TRIGGER trg_bandit_arms_updated BEFORE UPDATE ON public.bandit_arms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();