CREATE POLICY "Allow anonymous inserts to donation_requests"
ON public.donation_requests
FOR INSERT
TO anon
WITH CHECK (true);