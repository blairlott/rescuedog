
-- Datasets
CREATE TABLE IF NOT EXISTS public.cfo_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('upload','live_db')),
  source_format text,
  source_ref text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  row_count integer NOT NULL DEFAULT 0,
  column_meta jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfo_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance can view shared or own datasets"
  ON public.cfo_datasets FOR SELECT
  USING (
    public.can_view_finance(auth.uid())
    AND (visibility = 'shared' OR owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  );
CREATE POLICY "finance can insert own datasets"
  ON public.cfo_datasets FOR INSERT
  WITH CHECK (public.can_view_finance(auth.uid()) AND owner_id = auth.uid());
CREATE POLICY "finance can update own datasets"
  ON public.cfo_datasets FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "finance can delete own datasets"
  ON public.cfo_datasets FOR DELETE
  USING (owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_cfo_datasets_updated
  BEFORE UPDATE ON public.cfo_datasets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rows
CREATE TABLE IF NOT EXISTS public.cfo_dataset_rows (
  id bigserial PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES public.cfo_datasets(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cfo_dataset_rows_dataset ON public.cfo_dataset_rows(dataset_id, row_index);
ALTER TABLE public.cfo_dataset_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance can view rows of accessible datasets"
  ON public.cfo_dataset_rows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.cfo_datasets d
    WHERE d.id = dataset_id
      AND public.can_view_finance(auth.uid())
      AND (d.visibility = 'shared' OR d.owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));
CREATE POLICY "owner can write rows"
  ON public.cfo_dataset_rows FOR ALL
  USING (EXISTS (SELECT 1 FROM public.cfo_datasets d WHERE d.id = dataset_id AND (d.owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cfo_datasets d WHERE d.id = dataset_id AND (d.owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))));

-- Saved views
CREATE TABLE IF NOT EXISTS public.cfo_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  dataset_id uuid REFERENCES public.cfo_datasets(id) ON DELETE CASCADE,
  name text NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  pinned_to_dashboard boolean NOT NULL DEFAULT false,
  email_daily boolean NOT NULL DEFAULT false,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cfo_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance can view shared/own views"
  ON public.cfo_saved_views FOR SELECT
  USING (
    public.can_view_finance(auth.uid())
    AND (visibility = 'shared' OR owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  );
CREATE POLICY "finance can insert own views"
  ON public.cfo_saved_views FOR INSERT
  WITH CHECK (public.can_view_finance(auth.uid()) AND owner_id = auth.uid());
CREATE POLICY "owner can update views"
  ON public.cfo_saved_views FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));
CREATE POLICY "owner can delete views"
  ON public.cfo_saved_views FOR DELETE
  USING (owner_id = auth.uid() OR public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_cfo_saved_views_updated
  BEFORE UPDATE ON public.cfo_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cfo-finance', 'cfo-finance', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "finance users read own cfo-finance objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cfo-finance'
    AND public.can_view_finance(auth.uid())
    AND (owner = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  );
CREATE POLICY "finance users upload to cfo-finance"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cfo-finance'
    AND public.can_view_finance(auth.uid())
    AND owner = auth.uid()
  );
CREATE POLICY "finance users delete own cfo-finance objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cfo-finance'
    AND (owner = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  );
