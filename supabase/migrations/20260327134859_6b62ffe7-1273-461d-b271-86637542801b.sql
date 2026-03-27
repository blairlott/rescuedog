
-- Referral rewards / points ledger
CREATE TABLE public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  referred_email text,
  referred_name text,
  status text NOT NULL DEFAULT 'pending',
  referrer_points integer NOT NULL DEFAULT 0,
  referred_points integer NOT NULL DEFAULT 0,
  admin_note text,
  approved_at timestamptz,
  approved_by uuid
);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage referral rewards"
  ON public.referral_rewards FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()));

-- Users can view their own referrals (as referrer or referred)
CREATE POLICY "Users can view own referral rewards"
  ON public.referral_rewards FOR SELECT
  TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

-- Anyone authenticated can insert (on signup referral tracking)
CREATE POLICY "Authenticated users can insert referral rewards"
  ON public.referral_rewards FOR INSERT
  TO authenticated
  WITH CHECK (referred_id = auth.uid());
