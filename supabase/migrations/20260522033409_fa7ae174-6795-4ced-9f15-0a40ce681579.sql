
CREATE TABLE IF NOT EXISTS public.lindy_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  confidence text CHECK (confidence IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','promoted','error')),
  submitted_by text,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_notes text,
  promoted_ref text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lindy_inbox_status_created
  ON public.lindy_inbox (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lindy_inbox_type
  ON public.lindy_inbox (type);

ALTER TABLE public.lindy_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers can view lindy drafts"
  ON public.lindy_inbox FOR SELECT
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_cms_editor(auth.uid())
    OR public.is_ad_ops(auth.uid())
    OR public.is_ambassador_manager(auth.uid())
    OR public.is_dropship_manager(auth.uid())
  );

CREATE POLICY "Reviewers can update lindy drafts"
  ON public.lindy_inbox FOR UPDATE
  USING (
    public.is_admin_or_owner(auth.uid())
    OR public.is_cms_editor(auth.uid())
    OR public.is_ad_ops(auth.uid())
    OR public.is_ambassador_manager(auth.uid())
    OR public.is_dropship_manager(auth.uid())
  );

CREATE POLICY "Admins can delete lindy drafts"
  ON public.lindy_inbox FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER lindy_inbox_set_updated_at
  BEFORE UPDATE ON public.lindy_inbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
