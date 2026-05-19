---
name: Kennel Ad Optimization Stack
description: DoW/geo/seasonality modifiers, retention-risk view, nightly ad ingestion + Mailchimp audience sync with retry, ingestion status dashboard
type: feature
---

CONSUMER-only (non-wine-club, non-cancelled) Vinoshipper orders are the canonical source for all ad-optimization signals.

Tables (RLS via `can_view_kennel`; writes service-role only):
- `kennel_bid_modifiers`, `kennel_geo_modifiers`, `kennel_seasonality_curve`
- `kennel_ingest_runs` — per-target nightly run log (target/status/attempts/duration/error)

View: `kennel_retention_risk_summary` — 60–90d winback, aggregated per state.

Recompute edge functions (nightly):
- `kennel-recompute-bid-modifiers` 07:10 UTC
- `kennel-recompute-geo-modifiers` 07:15 UTC
- `kennel-recompute-seasonality` 07:20 UTC

Nightly ingestion (07:00 UTC):
- Orchestrator: `kennel-nightly-ingest` → calls meta/google/instacart ingest + `kennel-mailchimp-sync`
- 3× retry with exponential backoff (2s, 6s) per target
- Logs every attempt to `kennel_ingest_runs`
- Auth: `KENNEL_INGEST_SECRET` header OR service-role JWT

Mailchimp audience sync (`kennel-mailchimp-sync`):
- Reads vs_transactions 60–90d window, dedups by email
- Batch upserts to Mailchimp list (`MAILCHIMP_AUDIENCE_ID`) in chunks of 500 via `/lists/{id}` POST with `update_existing: true`
- Tags members `signal_winback_60_90`
- Tied-house compliant: audience-sync only; human triggers the campaign with approved templates that call `compliant_retailer_set()` at send time

UI (under `/kennel` "Data pipeline health"):
- `IngestionStatusPanel` — last run per target + Run Now button + recent failures
- `CronStatusPanel` — every kennel-* cron with stale/failed badges

`audience_update` recommendations (Meta ad-set targeting + lookalikes + Advantage+) execute via `kennel-execute` `dispatchMetaAudience`, with full rollback to prior `targeting` + `targeting_automation` from `rollback_state`.
