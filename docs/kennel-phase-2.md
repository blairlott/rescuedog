# The Kennel — Phase 2

Reference for the alerts, execution, and intelligence stack added in Phase 2.

## Wave summary

- **2A — Alerts + Live Execution** (shipped). Guardrails, baseline capture, kill switches, alert dispatch, rollback.
- **2B — Enterprise Ad Stack** (UI live on stub/seed data). Signals, attribution, pacing, frequency, fatigue, dayparting, weather.
- **2C — Local Delivery Signal Loop** (receivers stubbed). Instacart, DoorDash, GoPuff, UberEats purchase webhooks.

## Edge functions

| Function | Purpose | Trigger |
|---|---|---|
| `kennel-baseline-capture` | Snapshot per-campaign daily budget + per-channel MTD spend into `guardrail_baseline`. Flips prior `is_current=true` rows to false. | pg_cron `kennel-baseline-capture-daily` @ 08:00 UTC, or Settings → "Run baseline capture". |
| `kennel-execute` | Approve / reject / execute / rollback for `ad_recommendations`. Enforces kill switch (global + per-channel), guardrails (cap, % change), confidence floor, 24h cumulative Δ. Dispatches Meta / Google / Instacart. Writes `ad_execution_log` with `executor`, `before_value`, `after_value`, `delta_pct`, `spend_impact_cents`, `baseline_id`, `guardrail_results`. | Called from Recommendations & Log UI. |
| `kennel-alert-dispatch` | Single fan-out for ops alerts. Primary path is Lindy email watcher; Twilio is an opt-in fallback when `TWILIO_API_KEY` is configured. Writes `alert_dispatch_log`. | Called by `kennel-execute`, optimizer, pacing, anomaly jobs. |
| `kennel-alert-health` | Hourly self-check on `alert_dispatch_log`. If <50% success in the last 60 min OR last 3 dispatches failed, sends a direct Resend email bypassing Lindy. Suppressed for 6h after firing. | pg_cron `kennel-alert-health-hourly` @ `0 * * * *`. |
| `kennel-optimizer` | Generates recommendations across channels using strategy mix + signals. | pg_cron `kennel-optimizer-instacart-6h` + autopilot jobs. |
| `kennel-reconcile` | Nightly variance check between platform spend and Vinoshipper actuals. | pg_cron `kennel-reconcile-nightly` @ 03:10 UTC. |
| `kennel-pacing` | Daily EOM spend projection. `mtd / days_elapsed * days_in_month` vs `ad_settings.monthly_budget_cents` (global) and `monthly_budget_<channel>_cents`. Fires `pacing` alert when ratio > `pacing_alert_threshold` (default 1.10). `?dry_run=true` to inspect without alerting. | pg_cron `kennel-pacing-daily` @ `0 9 * * *`. |
| `kennel-attribution-dedup` | Nightly last-click 7d dedup. For each VS order, picks the most recent click/conversion event within 7d and credits ONLY that channel in `channel_performance_daily`. Overrides naive rollup totals. | pg_cron `kennel-attribution-dedup-nightly` @ `30 3 * * *`. |
| `kennel-creative-fatigue` | Per (channel, ad_id) 7d vs 30d CTR decay → `creative_fatigue` rows. When fatigue ≥ 0.40 and 7d impressions ≥ 1000, also writes an `ad_recommendations` row (`kind=creative_refresh`, `source=native`, idempotent on `ingest_request_id=fatigue:<platform>:<ad_id>:<date>`) so it surfaces in the Recommendations queue. | pg_cron `kennel-creative-fatigue-daily` @ `30 7 * * *`. |
| `kennel-dayparting` | Per (channel, campaign, dow, hour) bid modifier from 28d of `ad_performance_facts`. `pct = clamp((cr_slot / cr_channel) - 1, ±50%)`. Requires slot ≥ 50 clicks and ≥ 3 conversions before emitting. Writes `dayparting_recommendations`. | pg_cron `kennel-dayparting-daily` @ `45 7 * * *`. |
| `kennel-ingest` | HMAC-signed (`x-kennel-signature: sha256=…`) batched performance + recommendations push from Lindy. | External Lindy push. |

## Schema (Phase 2A core)

- `guardrail_baseline` — captured budget/spend snapshots. Columns: `id`, `platform`, `campaign_id` (nullable), `baseline_daily_budget_cents`, `baseline_mtd_spend_cents`, `captured_at`, `source` (`auto_daily` / `manual`), `is_current`.
- `ad_guardrails` — per-channel rules. Columns: `channel_id`, `daily_spend_cap_cents`, `max_bid_change_pct`, `max_budget_change_pct`, `paused`, `auto_execute_enabled`, `auto_execute_min_confidence`, `auto_execute_max_impact_cents`, `auto_execute_max_budget_change_pct`.
- `ad_settings` — key/value config: `kill_switch` (bool), `kill_switch_<channel>` (bool), `confidence_floor`, `daily_spend_cap_cents`, `max_single_exec_delta_pct`, `max_24h_cumulative_delta_pct`, `daily_spend_cap_multiplier`, `per_channel_spend_cap_multiplier`, `alert_recipients` (`{ email: [...], sms: [...] }`), `ingestion_mode`.
- `ad_execution_log` — append-only history. Includes `executor` (`auto` | `manual_approval`), `guardrail_results` (`{ passed, error }`), `before_value`, `after_value`, `delta_pct`, `spend_impact_cents`, `baseline_id`.
- `alert_dispatch_log` — every alert sent or attempted. Includes `channels_sent`, `email_message_id`, `sms_sid`, `success`, `error`.

## Alert payload contract

```json
{
  "event_type": "anomaly | recommendation | auto_executed | rollback | pacing | manual_test",
  "channel": "meta | google | instacart | kennel",
  "action": "string description",
  "spend_impact_cents": 0,
  "confidence": 0.0,
  "deep_link": "https://rescuedog.lovable.app/kennel/log?execution=<id>",
  "message": "optional free-text body"
}
```

Allowed `event_type` values are gated server-side. `health_check_failed` is reserved for the health monitor.

## Kill switches

- **Global**: `ad_settings.kill_switch = true` — blocks every `approve` and `execute`.
- **Per-channel**: `ad_settings.kill_switch_meta` / `kill_switch_google` / `kill_switch_instacart` — blocks only that platform.
- UI: Settings → toggles (confirm dialog). A sticky red banner renders in `KennelLayout` whenever any switch is on.
- Per-campaign switches are not implemented in v1.

## Rollback

- Available on `ad_execution_log` rows where `action='execute'`, `success=true`, and `created_at` is within 24h.
- Surfaced as a "Rollback" button on `/kennel/log`.
- Calls `kennel-execute` with `{ action: "rollback", recommendation_id }`. Restores `rollback_state` snapshot taken at execute time (Meta only in v1; Google / Instacart return `dispatched: false`).
- Writes a new `ad_execution_log` row with `action='rollback'` and fires a `rollback` alert.

## Secrets

All required secrets are already configured. New additions in Phase 2:

- `KENNEL_INGEST_SECRET` — HMAC key for `kennel-ingest`.
- `LINDY_PROXY_TOKEN`, `LINDY_EXPORT_TOKEN` — Lindy bridge auth.
- (Optional) `TWILIO_API_KEY` + `TWILIO_FROM_NUMBER` — enables Twilio SMS fallback in `kennel-alert-dispatch`. Not configured; Lindy email is the sole live path.

## Cron jobs (pg_cron)

| Job | Schedule |
|---|---|
| `kennel-baseline-capture-daily` | `0 8 * * *` |
| `kennel-alert-health-hourly` | `0 * * * *` |
| `kennel-autopilot-morning` | `0 6 * * *` |
| `kennel-autopilot-midday` | `0 14 * * *` |
| `kennel-optimizer-instacart-6h` | `0 */6 * * *` |
| `kennel-reconcile-nightly` | `10 3 * * *` |
| `kennel-attribution-dedup-nightly` | `30 3 * * *` |
| `kennel-pacing-daily` | `0 9 * * *` |
| `kennel-creative-fatigue-daily` | `30 7 * * *` |
| `kennel-dayparting-daily` | `45 7 * * *` |
| `kennel-delivery-fanout-5min` | `*/5 * * * *` |
| `kennel-sync-native-6h` | `0 */6 * * *` |
| `kennel-frequency-rollup-daily` | `0 8 * * *` |
| `kennel-weather-signals-6h` | `15 */6 * * *` |

## Phase 2C webhook receivers (planned)

- `webhook-instacart-purchase`, `webhook-doordash`, `webhook-gopuff`, `webhook-ubereats`.
- All deploy with `verify_jwt = false`; each verifies the platform's signed payload.
- Write to `local_delivery_events`, then fan out to existing Meta CAPI / Google OCI helpers.
- URLs follow `https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/<name>`.

### Receiver contract (live)

All four receivers share `_shared/local-delivery.ts`:

- HMAC-SHA256 verification of the raw body using a per-platform secret (`INSTACART_WEBHOOK_SECRET`, `DOORDASH_WEBHOOK_SECRET`, `GOPUFF_WEBHOOK_SECRET`, `UBEREATS_WEBHOOK_SECRET`). Header preference: platform-specific (`x-<platform>-signature`) then generic `x-signature`. Accepts either `sha256=<hex>` or raw hex.
- When the secret is unset, all requests are rejected unless `?test=true` is on the URL (smoke-test escape hatch).
- Email is SHA-256 hashed (lowercased) before storage; never persisted in plaintext. Raw payload is kept in `raw` for replay/debug.
- Dedup on `(platform, external_event_id)` via upsert.
- Writes `capi_status='pending'`, `oci_status='pending'`. A downstream worker (TBD) handles the actual Meta CAPI / Google OCI fanout.

### Fanout worker — `kennel-delivery-fanout`

Drains `local_delivery_events` rows where `capi_status='pending'` OR `oci_status='pending'` (batch 200, oldest first).

- **Meta CAPI**: posts `Purchase` event with `event_id = "<platform>:<external_event_id>"` for dedup, `action_source = "physical_store"`, hashed email as the only matchable identifier. Stamps `capi_status` to `sent`, `failed: <reason>`, or `skipped_no_secret`.
- **Google OCI**: stamps `oci_status = "skipped_no_gclid"` — OCI requires a `gclid` we cannot recover from delivery-platform payloads. Revisit when a platform exposes click ids.
- **Cron**: `kennel-delivery-fanout-5min` @ `*/5 * * * *`.

### Expected request shapes

Best-effort field mapping; refine after the first real payload arrives from each platform:

| Platform | external_event_id | revenue source | timestamp |
|---|---|---|---|
| instacart | `event_id` | `total_cents` | `occurred_at` |
| doordash | `order_id` | `subtotal_cents` ⊃ `total_cents` | `placed_at` |
| gopuff | `order_id` | `total_cents` | `placed_at` |
| ubereats | `event_id` / `meta.resource_id` | `order.payment.charges.total.amount` × 100 | `event_time` |

## Where to change thresholds

Settings UI (`/kennel/settings`) → falls back to writing the relevant `ad_settings` row. Per-channel guardrails edit `ad_guardrails` directly.