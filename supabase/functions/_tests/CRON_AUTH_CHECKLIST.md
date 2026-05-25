# Cron / admin secret-gate verification checklist

For each endpoint: send `POST` with body `{}` (or the noted dry-run payload).
The `apikey` header must be the project anon key.

| # | Function | Header | Env var | No header → expect | With header → expect |
|---|---|---|---|---|---|
| 1 | `compliance-audit`              | `x-cron-secret`        | `CRON_SECRET`            | 401 | 200 |
| 2 | `ai-creative-variants`          | `x-cron-secret`        | `CRON_SECRET`            | 401 | 200 |
| 3 | `seo-autopilot-sweep`           | `x-cron-secret`        | `CRON_SECRET`            | 401 | 200 |
| 4 | `auto-curate-media`             | `x-cron-secret`        | `CRON_SECRET`            | 401 | 200 |
| 5 | `z8-nightly-optimizer`          | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true`) |
| 6 | `keyword-recommender`           | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 |
| 7 | `instacart-autopilot`           | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true`) |
| 8 | `instacart-ads-execute`         | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true`) |
| 9 | `platform-radar-scan`           | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 |
|10 | `meta-autopilot`                | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true`) |
|11 | `meta-ads-execute`              | `x-cron-secret`        | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true`) |
|12 | `kennel-self-health`            | `x-kennel-cron-secret` | `KENNEL_INGEST_SECRET`   | 401 | 200 |
|13 | `kennel-rule-suggestions`       | `x-kennel-cron-secret` | `KENNEL_INGEST_SECRET`   | 401 | 200 |
|14 | `kennel-optimizer`              | `x-kennel-cron-secret` | `KENNEL_INGEST_SECRET`   | 401 | 200 (`dry_run:true, platform:"instacart"`) |
|15 | `kennel-oci-backlog-alert`      | `x-kennel-cron-secret` | `KENNEL_INGEST_SECRET`   | 401 | 200 (`probe:true`) |
|16 | `vinoshipper-conversions-backfill` | `x-kennel-cron-secret` | `KENNEL_INGEST_SECRET` | 401 | 200 (`dry_run:true`) |
|17 | `gtm-deploy`                    | `x-admin-secret`       | `GTM_DEPLOY_ADMIN_SECRET`| 401 | 200 (or business 4xx — NOT 401) |
|18 | `provision-reviewer`            | `x-admin-secret`       | `PROVISION_ADMIN_SECRET` | 401 | 200 (or business 4xx — NOT 401) |

## One-shot verification

```bash
export SUPABASE_URL=https://eskqaxmypgvwtsffcbsw.supabase.co
export SUPABASE_ANON_KEY=...
export CRON_SECRET=...
export KENNEL_INGEST_SECRET=...
export GTM_DEPLOY_ADMIN_SECRET=...
export PROVISION_ADMIN_SECRET=...

deno run --allow-net --allow-env supabase/functions/_tests/verify-cron-auth.ts
```

Output is `PASS` / `FAIL` per row, with non-zero exit on any failure.
Any endpoint whose env var is not exported is reported as `SKIP` (not a failure)
so partial runs are useful.

## Manual curl (single endpoint)

```bash
# 1) Expect 401
curl -i -X POST "$SUPABASE_URL/functions/v1/compliance-audit" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'

# 2) Expect 200
curl -i -X POST "$SUPABASE_URL/functions/v1/compliance-audit" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" -d '{}'
```