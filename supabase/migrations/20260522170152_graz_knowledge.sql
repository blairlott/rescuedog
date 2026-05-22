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
