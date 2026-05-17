-- Finance expense facts from QuickBooks (via Lindy)
CREATE TABLE IF NOT EXISTS public.business_expense_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  category text NOT NULL, -- 'cogs' | 'cost_of_sales' | 'operating_expense'
  subcategory text,        -- e.g. 'payroll', 'marketing', 'rent', 'shipping', 'packaging', 'freight'
  account text,            -- QuickBooks account name
  account_id text,         -- QuickBooks account id
  vendor text,
  memo text,
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'lindy_quickbooks',
  external_id text,        -- QuickBooks txn id, used for idempotency when present
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dim_hash text GENERATED ALWAYS AS (
    md5(category || '|' || COALESCE(subcategory,'') || '|' || COALESCE(account,'') || '|' || COALESCE(vendor,'') || '|' || COALESCE(external_id,''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS biz_expense_unique ON public.business_expense_facts (date, dim_hash);
CREATE INDEX IF NOT EXISTS biz_expense_category_date ON public.business_expense_facts (category, date DESC);
CREATE INDEX IF NOT EXISTS biz_expense_date ON public.business_expense_facts (date DESC);

ALTER TABLE public.business_expense_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "biz_expense_read" ON public.business_expense_facts
  FOR SELECT USING (public.is_executive(auth.uid()) OR public.is_ad_ops(auth.uid()));

CREATE POLICY "biz_expense_write" ON public.business_expense_facts
  FOR ALL USING (public.is_executive(auth.uid())) WITH CHECK (public.is_executive(auth.uid()));

CREATE TRIGGER biz_expense_updated_at BEFORE UPDATE ON public.business_expense_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();