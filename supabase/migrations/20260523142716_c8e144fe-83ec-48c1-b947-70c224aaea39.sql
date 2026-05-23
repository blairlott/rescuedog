-- Add workflow tracking to lindy_inbox so the Kennel backlog can manage execution state
-- without disturbing the existing review status flow.

ALTER TABLE public.lindy_inbox
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS owner text NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS workflow_note text,
  ADD COLUMN IF NOT EXISTS workflow_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_updated_by uuid;

-- Constrain allowed values
DO $$ BEGIN
  ALTER TABLE public.lindy_inbox
    ADD CONSTRAINT lindy_inbox_workflow_status_chk
    CHECK (workflow_status IN ('queued','in_progress','done','blocked','needs_blair','needs_lindy'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lindy_inbox
    ADD CONSTRAINT lindy_inbox_owner_chk
    CHECK (owner IN ('lindy','lovable','blair','unassigned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: anything approved becomes queued; everything else stays queued by default.
UPDATE public.lindy_inbox
SET workflow_status = 'queued', workflow_updated_at = COALESCE(reviewed_at, created_at)
WHERE status = 'approved' AND (workflow_status IS NULL OR workflow_status = 'queued') AND workflow_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lindy_inbox_workflow
  ON public.lindy_inbox (workflow_status, created_at DESC);

-- RPC for admin/ad-ops to update backlog state. Security definer so it bypasses RLS write checks.
CREATE OR REPLACE FUNCTION public.update_backlog_item(
  _id uuid,
  _workflow_status text DEFAULT NULL,
  _owner text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS public.lindy_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.lindy_inbox;
BEGIN
  IF NOT (public.is_admin_or_owner(_uid) OR public.is_ad_ops(_uid)) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _workflow_status IS NOT NULL AND _workflow_status NOT IN
     ('queued','in_progress','done','blocked','needs_blair','needs_lindy') THEN
    RAISE EXCEPTION 'invalid workflow_status: %', _workflow_status;
  END IF;
  IF _owner IS NOT NULL AND _owner NOT IN ('lindy','lovable','blair','unassigned') THEN
    RAISE EXCEPTION 'invalid owner: %', _owner;
  END IF;

  UPDATE public.lindy_inbox
     SET workflow_status     = COALESCE(_workflow_status, workflow_status),
         owner               = COALESCE(_owner, owner),
         workflow_note       = COALESCE(_note, workflow_note),
         workflow_updated_at = now(),
         workflow_updated_by = _uid
   WHERE id = _id
  RETURNING * INTO _row;

  IF NOT FOUND THEN RAISE EXCEPTION 'backlog item not found: %', _id; END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_backlog_item(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_backlog_item(uuid, text, text, text) TO authenticated;