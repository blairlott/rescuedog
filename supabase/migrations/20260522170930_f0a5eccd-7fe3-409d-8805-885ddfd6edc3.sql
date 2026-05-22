
-- 1. graz_directives.kind
ALTER TABLE public.graz_directives
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'directive'
  CHECK (kind IN ('directive', 'context'));
CREATE INDEX IF NOT EXISTS graz_directives_user_kind_active_idx
  ON public.graz_directives (user_id, kind, active);

-- 2. graz_knowledge
CREATE TABLE IF NOT EXISTS public.graz_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('brief','history','ops','industry_scan','competitor','consumer','misc')),
  title text NOT NULL,
  content text NOT NULL,
  source_url text,
  active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS graz_knowledge_kind_active_idx
  ON public.graz_knowledge (kind, active, priority DESC, created_at DESC);

ALTER TABLE public.graz_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leadership reads graz knowledge" ON public.graz_knowledge;
CREATE POLICY "leadership reads graz knowledge"
  ON public.graz_knowledge FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'cfo'::app_role)
    OR has_role(auth.uid(), 'executive'::app_role)
  );

DROP POLICY IF EXISTS "admins write graz knowledge" ON public.graz_knowledge;
CREATE POLICY "admins write graz knowledge"
  ON public.graz_knowledge FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS graz_knowledge_set_updated_at ON public.graz_knowledge;
    CREATE TRIGGER graz_knowledge_set_updated_at
      BEFORE UPDATE ON public.graz_knowledge
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 3. Seeds
INSERT INTO public.graz_knowledge (kind, title, content, priority) VALUES
('brief', 'RDW one-pager (seed)',
'Rescue Dog Wines (RDW) is a small, cause-driven DTC wine + merch business. Mission: helping dogs find their forever home. Brand voice: quietly bold, never quantified-impact bragging until verified. Brand cues: red #c30017, black, grey; Nunito Sans / Avenir Next; flat sharp edges (no rounded corners); dual-brand split between high-def Rescue Dog logo (merch) and black RDW logo (wine).
Tech: Lovable Cloud (Supabase) for DB/auth/CRM/CMS. Wine catalog in Supabase wine_products. Merch in headless Shopify (Storefront API). Wine checkout = Vinoshipper deep-link handoff for compliance + payment. Merch checkout = Shopify cart checkoutUrl in new tab. Age gate on wine routes only.
Revenue rails: DTC wine (Vinoshipper) - Wine club (custom, replacing Vinoshipper club) - Wholesale (B2B inquiries by region) - Merch (Shopify) - Donations (501(c) form, Resend email).
Always say "shipping included" - never "free shipping". Loyalty is access-based ("The Pack"), never % off.', 10),

('ops', 'RDW operating rails (seed)',
'Marketing stack: Meta + Google ads (tracked in Command Center / Kennel mirrors), Klaviyo-style retention via club + lifecycle.
Compliance: state-by-state wine shipping rules; adult-sig required; UPS weather holds in summer/winter. Wine compliance enforced at Vinoshipper checkout.
Fulfillment: wine ships via Vinoshipper bonded warehouse; merch via Shopify-connected dropship (Printful + others).
Ambassador program: single-tier, impact.com handles commission/1099, vanity pages + tasting events.
Internal AI: Graz for finance/strategy; Bob for ops notes; Lindy as data + content automation agent writing into lindy_inbox.', 8),

('ops', 'Wine industry COO operations playbook (seed)',
'PRODUCTION CALENDAR: Northern Hemisphere crush Aug-Oct; bottling typically 6-18 months post-fermentation depending on varietal (whites/rosés bottled spring after harvest; reds 12-24+ months in barrel). Lock glass + closures + capsules + label print POs 90-120 days before bottling; dry-goods lead times have not normalized post-2022 — expect 8-14 weeks on glass, 10-16 weeks on screwcaps, 6-10 weeks on labels.
COGS BREAKDOWN (typical DTC wine ~$25 SRP): juice/bulk 18-28%, glass 8-12%, closure+capsule 3-5%, label+print 2-4%, bottling/co-pack run 6-10%, freight inbound 3-6%, warehousing+pick/pack 8-12%, payment+platform 3-4%, compliance/excise tax 2-5%, breakage/shrink 1-2%. Gross margin target 55-65% DTC, 30-40% wholesale.
COMPLIANCE: TTB COLA approval required before sale (label registration, 30-90 days typical). State-by-state DTC permits + monthly/quarterly excise + sales tax filings (ShipCompliant or Avalara). Reciprocal/permit states ~46; closed/limited: UT, MS, RI, AL, KY (varies — check current). Direct-to-trade requires 3-tier in non-self-distribution states. Adult signature 21+ required by carrier (UPS/FedEx Ground); USPS cannot ship wine.
FULFILLMENT: Bonded vs non-bonded warehouse matters — bonded delays excise until ship-out. Temp-controlled storage critical May-Sept and Nov-Feb (weather holds). Avg DTC pick/pack $4-7/order; freight $15-30 per 6-pack zone-dependent. Breakage SLA target <0.5%.
CHANNEL ECONOMICS: DTC LTV driven by club retention (target >70% 12mo, >50% 24mo); club skip rate >20%/cycle is a churn warning. Wholesale: distributor takes 25-30%, retailer 30-33%, leaving ~40% to winery — only works at scale or as halo. Tasting room (where applicable) highest margin but capex-heavy.
OPERATING LEVERS A COO PULLS: (1) Bulk wine sourcing vs estate — bulk arbitrage when juice market soft. (2) Co-pack vs in-house bottling break-even ~15-25k cases. (3) Lightweight glass saves 15-20% on glass + freight. (4) Bag-in-box / canned formats for new occasions. (5) Club cadence (quarterly vs bi-monthly) trades AOV vs churn. (6) Pre-sell / futures programs to fund harvest working capital. (7) Hedge freight via zone-skipping or regional 3PL nodes. (8) Allocation strategy on scarce SKUs to drive club signups.
SEASONALITY: Q4 = 35-45% of annual DTC revenue (Nov-Dec). Summer trough Jun-Aug, weather holds compound. Mother''s Day, Valentine''s, and harvest release windows are the other peaks.
KPIs A WINE COO WATCHES WEEKLY: cases shipped, club active count + net adds, club churn %, AOV, repeat rate 30/60/90, ad CAC by channel, contribution margin per case, bonded inventory weeks-on-hand, breakage %, weather-hold queue depth, comp-state revenue mix.', 9)
ON CONFLICT DO NOTHING;
