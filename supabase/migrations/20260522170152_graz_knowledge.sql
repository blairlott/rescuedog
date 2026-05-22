-- Global, admin-curated knowledge base that Graz pulls into every prompt.
-- Holds the RDW business brief, history, ops facts, and rolling industry
-- intel from daily internet scans.
CREATE TABLE IF NOT EXISTS public.graz_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('brief', 'history', 'ops', 'industry_scan', 'competitor', 'consumer', 'misc')),
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

CREATE POLICY "leadership reads graz knowledge"
  ON public.graz_knowledge FOR SELECT
  USING (
    has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'cfo')
    OR has_role(auth.uid(), 'executive')
  );

CREATE POLICY "admins write graz knowledge"
  ON public.graz_knowledge FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

CREATE TRIGGER graz_knowledge_set_updated_at
  BEFORE UPDATE ON public.graz_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial Graz brief so the persona has substance before Lindy
-- delivers the deeper RDW history brief.
INSERT INTO public.graz_knowledge (kind, title, content, priority) VALUES
('brief', 'RDW one-pager (seed)', 'Rescue Dog Wines (RDW) is a small, cause-driven DTC wine + merch business. Mission: helping dogs find their forever home. Brand voice: quietly bold, never quantified-impact bragging until verified. Brand cues: red #c30017, black, grey, Nunito Sans / Avenir Next, flat sharp edges (no rounded corners), dual-brand split between high-def Rescue Dog logo (merch) and black RDW logo (wine).
Tech: Lovable Cloud (Supabase) for DB/auth/CRM/CMS. Wine catalog in Supabase wine_products. Merch in headless Shopify (Storefront API). Wine checkout = Vinoshipper deep-link handoff for compliance + payment. Merch checkout = Shopify cart checkoutUrl in new tab. Age gate on wine routes only.
Revenue rails: DTC wine (Vinoshipper) - Wine club (custom, replacing Vinoshipper club) - Wholesale (B2B inquiries by region) - Merch (Shopify) - Donations (501(c) form, Resend email).
Always say "shipping included" - never "free shipping". Loyalty is access-based ("The Pack"), never % off.', 10),
('ops', 'RDW operating rails (seed)', 'Marketing stack: Meta + Google ads (tracked in Command Center / Kennel mirrors), Klaviyo-style retention via club + lifecycle.
Compliance: state-by-state wine shipping rules; adult-sig required; UPS weather holds in summer/winter. Wine compliance enforced at Vinoshipper checkout.
Fulfillment: wine ships via Vinoshipper bonded warehouse; merch via Shopify-connected dropship (Printful + others).
Ambassador program: single-tier, impact.com handles commission/1099, vanity pages + tasting events.
Internal AI: Graz for finance/strategy; Bob for ops notes; Lindy as data + content automation agent writing into lindy_inbox.', 8)
ON CONFLICT DO NOTHING;
