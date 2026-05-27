## Why it failed

The `gclid-oci-loop-2h` cron job was scheduled with a **hardcoded** `x-cron-secret` value baked into its SQL:

```
x-cron-secret: 71b50a6d97fd9f66cf75f98f3fc1155a1cfd745dae30cb2693c9d152fd90a69c
```

That literal no longer matches the current `CRON_SECRET` edge-function env var (likely rotated at some point), so every 2h invocation has been returning 401 for the last ~14 hours. The `KENNEL_INGEST_SECRET`-style crons use a `vault.decrypted_secrets` lookup at run time and don't have this drift problem — `gclid-oci-loop-2h` is the only one of the failing crons that even tries to send `x-cron-secret`. (`kennel-baseline-capture-daily` and `phase4-meta-lookalike-trigger` send only `apikey`; their auth_fail entries are a separate issue.)

I can't read `CRON_SECRET` from the database (it's an edge-function env var, not in `vault.secrets`), so I can't just rewrite the cron with the right literal. Two paths:

## Fix (durable, no manual secret entry)

1. **Add a one-shot edge function `cron-secret-vault-sync`** that reads `Deno.env.get("CRON_SECRET")` server-side and upserts it into `vault.secrets` under the name `CRON_SECRET`. Auth-gated to admin JWT only.
2. **Call it once** with the admin JWT (preview session) so the current `CRON_SECRET` env value lands in vault without ever crossing the wire to you or me.
3. **Reschedule `gclid-oci-loop-2h`** via `cron.unschedule` + `cron.schedule`, replacing the hardcoded header with the live vault lookup:
   ```sql
   headers := jsonb_build_object(
     'Content-Type','application/json',
     'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CRON_SECRET' LIMIT 1)
   )
   ```
4. **Verify**: poll `net._http_response` and `cron_run_log` once after the next 2h tick (or trigger an ad-hoc `SELECT net.http_post(...)` with the same body). Expect `200` with a `scanned/matched/uploaded` payload, no new `auth_fail` rows.

After this is done, any future `CRON_SECRET` rotation just requires re-invoking `cron-secret-vault-sync` once — the cron picks up the new value automatically.

## Out of scope (flagging, not fixing)

- `kennel-baseline-capture-daily` and `phase4-meta-lookalike-trigger` are also producing auth_fail entries but for a different reason — their cron commands don't send `x-cron-secret` at all (only `apikey`). Those should be migrated to the same vault-pull pattern in a follow-up, not in this turn.

## Alternative (if you don't want a new edge function)

Tell me to **rotate `CRON_SECRET` to a fresh value** via the secrets form. You enter the same value into the secrets form (env var update) and I'll write the cron with that exact literal in the same turn. Less elegant — drifts again on next rotation — but no new edge function and no vault dependency.
