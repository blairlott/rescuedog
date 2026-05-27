## Root cause

`vinoshipper-poll-15min` cron has been returning **401 unauthorized** every 15 minutes since at least last night (every entry in `net._http_response` for this cron is a 401). The cron reads `KENNEL_INGEST_SECRET` from `vault.decrypted_secrets` and sends it as `x-kennel-ingest-secret`; the function compares it to the `KENNEL_INGEST_SECRET` edge-function env var. The two values no longer match, so no Vinoshipper orders have been polled and `vs_transactions` stayed empty → the OCI loop had nothing to scan.

## Fix

**1. Add a `CRON_SECRET` fallback to `vinoshipper-poll`** (`supabase/functions/vinoshipper-poll/index.ts`)

The function currently accepts only `x-kennel-ingest-secret` or an admin JWT. Add a third accepted path that mirrors what every other healthy cron in this project uses — `x-cron-secret` compared against the existing `CRON_SECRET` env var (already populated, already used by `gclid-oci-loop` and others). This decouples the function from the broken vault entry and matches the project's established pattern.

```ts
// in addition to the existing secretOk check
const cronSecret = req.headers.get("x-cron-secret");
const expectedCronSecret = Deno.env.get("CRON_SECRET");
const cronOk = !!expectedCronSecret && cronSecret === expectedCronSecret;
if (!secretOk && !cronOk) { /* fall through to JWT check */ }
```

**2. Repoint the cron job to use `x-cron-secret`** (insert SQL, not migration — cron commands hold environment-specific values)

```sql
SELECT cron.unschedule('vinoshipper-poll-15min');
SELECT cron.schedule(
  'vinoshipper-poll-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/vinoshipper-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
    ),
    body := jsonb_build_object('limit', 100)
  );
  $$
);
```

**3. Verify by polling `net._http_response` once**

After deploy + reschedule, the next quarter-hour cron tick should return `200` with a `scanned`/`inserted` JSON payload instead of 401. Then `vs_transactions` will start filling in, and the next 2-hour `gclid-oci-loop` run will have rows to match against.

**4. Leave the existing `x-kennel-ingest-secret` path in place.** It's still used by any Lindy/admin workflow that knows the value; the new `x-cron-secret` path is purely additive.

## Out of scope

- No changes to `gclid-oci-loop`, the OCI page, or RLS.
- Not touching the vault `KENNEL_INGEST_SECRET` entry — if you want to also re-seed that later for Lindy, we can do it separately.
- No backfill SQL for `vs_transactions` — `vinoshipper-poll` will pull recent orders on its own once it can authenticate. (If you need orders older than its default lookback, we can trigger `vinoshipper-conversions-backfill` afterward.)
