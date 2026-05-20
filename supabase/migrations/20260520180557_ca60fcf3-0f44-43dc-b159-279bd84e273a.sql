
ALTER TABLE public.wine_subscriptions
  ADD COLUMN IF NOT EXISTS dunning_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dunning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_exp_month smallint,
  ADD COLUMN IF NOT EXISTS card_exp_year smallint,
  ADD COLUMN IF NOT EXISTS card_expiry_notice_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wine_subs_dunning
  ON public.wine_subscriptions (failure_count, last_dunning_sent_at)
  WHERE failure_count > 0;
