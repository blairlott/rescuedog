
-- =========================================================================
-- 1. wine_order_gift_intents — pending gift intents created at checkout,
--    matched to Vinoshipper orders when the webhook fires.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.wine_order_gift_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email TEXT,
  buyer_name TEXT,
  vinoshipper_customer_id TEXT,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  gift_message TEXT,
  gift_wrap BOOLEAN NOT NULL DEFAULT false,
  bottle_count INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER,
  source TEXT NOT NULL DEFAULT 'a_la_carte',  -- 'a_la_carte' | 'club_one_time' | 'club_subscription'
  matched_vs_order_id TEXT,
  matched_at TIMESTAMPTZ,
  recipient_emailed_at TIMESTAMPTZ,
  recipient_shipped_emailed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wine_order_gift_intents_unmatched_idx
  ON public.wine_order_gift_intents (vinoshipper_customer_id, expires_at)
  WHERE matched_vs_order_id IS NULL;

CREATE INDEX IF NOT EXISTS wine_order_gift_intents_buyer_email_idx
  ON public.wine_order_gift_intents (lower(buyer_email))
  WHERE matched_vs_order_id IS NULL;

CREATE INDEX IF NOT EXISTS wine_order_gift_intents_matched_idx
  ON public.wine_order_gift_intents (matched_vs_order_id)
  WHERE matched_vs_order_id IS NOT NULL;

ALTER TABLE public.wine_order_gift_intents ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. anonymous checkout) can create a gift intent.
CREATE POLICY "anyone can create gift intent"
  ON public.wine_order_gift_intents
  FOR INSERT
  WITH CHECK (true);

-- Buyer can read their own intents.
CREATE POLICY "buyer reads own gift intents"
  ON public.wine_order_gift_intents
  FOR SELECT
  USING (
    buyer_user_id = auth.uid()
    OR public.is_admin_or_owner(auth.uid())
  );

-- Admins can update / delete for audit / GDPR.
CREATE POLICY "admins manage gift intents"
  ON public.wine_order_gift_intents
  FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- =========================================================================
-- 2. wine_club_memberships — add gift fields
-- =========================================================================
ALTER TABLE public.wine_club_memberships
  ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS gift_recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS gift_message TEXT,
  ADD COLUMN IF NOT EXISTS gift_duration_months INTEGER;

-- =========================================================================
-- 3. order_email_settings — per-template enable toggle (CMS controlled)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.order_email_settings (
  template_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.order_email_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read enabled flags (so client and edge functions can check).
CREATE POLICY "public reads order email settings"
  ON public.order_email_settings
  FOR SELECT
  USING (true);

-- Only CMS editors / admins can modify.
CREATE POLICY "cms editors manage order email settings"
  ON public.order_email_settings
  FOR ALL
  USING (public.is_cms_editor(auth.uid()))
  WITH CHECK (public.is_cms_editor(auth.uid()));

-- Seed defaults (all enabled).
INSERT INTO public.order_email_settings (template_name, enabled, description) VALUES
  ('gift-recipient-incoming', true, 'Sent to gift recipients when an a la carte wine order is placed (before it ships).'),
  ('gift-recipient-shipped', true, 'Sent to gift recipients when their wine order ships (includes tracking).'),
  ('club-shipment-shipped', true, 'Sent to wine club members when their shipment ships (includes tasting notes for each bottle).'),
  ('club-gift-shipment-shipped', true, 'Sent to wine club GIFT recipients when their shipment ships.')
ON CONFLICT (template_name) DO NOTHING;
