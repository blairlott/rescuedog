
CREATE OR REPLACE FUNCTION public._test_kis_fingerprint()
RETURNS TABLE(name text, secret_len int, first4 text, last4 text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
BEGIN
  RETURN QUERY
  SELECT ds.name::text,
         length(ds.decrypted_secret)::int,
         substring(ds.decrypted_secret, 1, 4)::text,
         substring(ds.decrypted_secret, length(ds.decrypted_secret)-3, 4)::text
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'KENNEL_INGEST_SECRET';
END $$;
