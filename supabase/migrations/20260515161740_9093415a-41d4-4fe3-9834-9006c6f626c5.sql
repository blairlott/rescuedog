CREATE TABLE public.depletion_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  distributor text,
  period_label text,
  status text NOT NULL DEFAULT 'parsing',
  total_lines integer NOT NULL DEFAULT 0,
  matched_lines integer NOT NULL DEFAULT 0,
  new_account_lines integer NOT NULL DEFAULT 0,
  unmatched_lines integer NOT NULL DEFAULT 0,
  auto_published_count integer NOT NULL DEFAULT 0,
  ai_summary text,
  raw_preview text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.depletion_report_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.depletion_reports(id) ON DELETE CASCADE,
  raw_row jsonb,
  account_name text,
  street_address text,
  city text,
  state text,
  zip text,
  phone text,
  premise_type text,
  sku text,
  cases numeric,
  units numeric,
  period_start date,
  period_end date,
  ai_confidence numeric,
  match_status text NOT NULL DEFAULT 'pending',
  matched_account_id uuid REFERENCES public.sales_accounts(id) ON DELETE SET NULL,
  created_account_id uuid REFERENCES public.sales_accounts(id) ON DELETE SET NULL,
  auto_published boolean NOT NULL DEFAULT false,
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dep_lines_report ON public.depletion_report_lines(report_id);
CREATE INDEX idx_dep_lines_match_status ON public.depletion_report_lines(match_status);

ALTER TABLE public.depletion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depletion_report_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_sales_team(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner','admin','national_manager','regional_manager','state_manager','brand_ambassador')
  )
$$;

CREATE POLICY "Sales team manage depletion reports"
ON public.depletion_reports FOR ALL TO authenticated
USING (public.is_sales_team(auth.uid()))
WITH CHECK (public.is_sales_team(auth.uid()));

CREATE POLICY "Sales team manage depletion lines"
ON public.depletion_report_lines FOR ALL TO authenticated
USING (public.is_sales_team(auth.uid()))
WITH CHECK (public.is_sales_team(auth.uid()));

CREATE TRIGGER trg_dep_reports_updated
BEFORE UPDATE ON public.depletion_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();