CREATE POLICY "Anon can read lindy_inbox for polling"
ON public.lindy_inbox
FOR SELECT
TO anon
USING (true);