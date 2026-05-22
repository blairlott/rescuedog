ALTER TABLE public.graz_directives
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'directive'
  CHECK (kind IN ('directive', 'context'));

CREATE INDEX IF NOT EXISTS graz_directives_user_kind_idx
  ON public.graz_directives (user_id, kind, active);
