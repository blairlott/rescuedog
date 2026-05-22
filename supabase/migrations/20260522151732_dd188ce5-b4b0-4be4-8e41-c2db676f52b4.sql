-- ============== Phase 1: CFO Boards + Push-View ==============

-- 1. Allow CFO + executive to view Kennel data for read-only mirroring
CREATE OR REPLACE FUNCTION public.can_view_kennel(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('owner','admin','ad_ops_manager','executive','kennel_viewer','cfo')
  )
$$;

-- 2. CFO Boards (multi-board workspaces)
CREATE TABLE IF NOT EXISTS public.cfo_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  tiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  date_range_days integer NOT NULL DEFAULT 90,
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);

CREATE INDEX IF NOT EXISTS cfo_boards_owner_idx ON public.cfo_boards(owner_id, position);

CREATE TRIGGER cfo_boards_touch
BEFORE UPDATE ON public.cfo_boards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cfo_boards ENABLE ROW LEVEL SECURITY;

-- 3. Board shares (push-view)
CREATE TYPE public.cfo_share_type AS ENUM ('live','snapshot');

CREATE TABLE IF NOT EXISTS public.cfo_board_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.cfo_boards(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  recipient_user_id uuid,
  recipient_email text,
  share_type public.cfo_share_type NOT NULL DEFAULT 'live',
  message text,
  -- Frozen at share time for snapshots: tiles, date_range_days, captured values
  snapshot jsonb,
  viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cfo_board_shares_board_idx ON public.cfo_board_shares(board_id);
CREATE INDEX IF NOT EXISTS cfo_board_shares_recipient_idx ON public.cfo_board_shares(recipient_user_id);
CREATE INDEX IF NOT EXISTS cfo_board_shares_email_idx ON public.cfo_board_shares(lower(recipient_email));

ALTER TABLE public.cfo_board_shares ENABLE ROW LEVEL SECURITY;

-- 4. Helper: is current user a recipient of any active share for this board
CREATE OR REPLACE FUNCTION public.is_board_recipient(_board_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cfo_board_shares s
    LEFT JOIN auth.users u ON u.id = _user_id
    WHERE s.board_id = _board_id
      AND s.revoked_at IS NULL
      AND (
        s.recipient_user_id = _user_id
        OR lower(s.recipient_email) = lower(u.email)
      )
  )
$$;

-- 5. RLS: cfo_boards
CREATE POLICY "boards: owner full" ON public.cfo_boards
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "boards: recipient read" ON public.cfo_boards
  FOR SELECT TO authenticated
  USING (public.is_board_recipient(id, auth.uid()));

-- 6. RLS: cfo_board_shares
CREATE POLICY "shares: creator full" ON public.cfo_board_shares
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "shares: recipient read" ON public.cfo_board_shares
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR lower(recipient_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

CREATE POLICY "shares: recipient mark viewed" ON public.cfo_board_shares
  FOR UPDATE TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR lower(recipient_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  )
  WITH CHECK (
    recipient_user_id = auth.uid()
    OR lower(recipient_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );