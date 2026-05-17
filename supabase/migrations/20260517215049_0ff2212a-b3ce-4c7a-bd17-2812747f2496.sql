CREATE TABLE IF NOT EXISTS public.bm_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  date date NOT NULL,
  entry_type text NOT NULL,
  category text NOT NULL,
  subcategory text,
  account_name text,
  account_code text,
  vendor text,
  memo text,
  amount_cents bigint NOT NULL,
  currency text DEFAULT 'USD',
  sku text,
  units integer,
  state text,
  channel text,
  source text DEFAULT 'quickbooks',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bm_finance_entries_date ON public.bm_finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_bm_finance_entries_category ON public.bm_finance_entries(category);
CREATE INDEX IF NOT EXISTS idx_bm_finance_entries_channel ON public.bm_finance_entries(channel);
CREATE INDEX IF NOT EXISTS idx_bm_finance_entries_state ON public.bm_finance_entries(state);

ALTER TABLE public.bm_finance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kennel viewers can read finance entries"
ON public.bm_finance_entries
FOR SELECT
TO authenticated
USING (public.can_view_kennel(auth.uid()));

CREATE TRIGGER update_bm_finance_entries_updated_at
BEFORE UPDATE ON public.bm_finance_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();