# Kennel Phase 3.1 — Meta Audiences + Intelligence Layer (revised)

Incorporates Claude's review. No auto-rec-creation in this round; Action button is human-click only.

## Pre-build confirmations
1. Query `vs_transactions` schema (columns for SKU/line items, qty, ship state/zip, cart type, order total, email, timestamp) + earliest order date.
2. Confirm ≥30 days history exists for baselines.
3. Request `META_SYSTEM_USER_TOKEN` + `KENNEL_EXTERNAL_SIGNAL_SECRET` secrets (Blair generates Meta token separately).

## Schema (single migration)

### `sku_catalog` (NEW — varietal/color truth table)
- `sku text PK, varietal text, color text ('red'|'white'|'rose'|'sparkling'|'other'), style text, active bool default true`
- RLS: ad_ops/admin write, kennel_viewer read
- Seed with current RDW SKUs (I'll query `wine_products` + `vs_transactions` distinct SKUs to seed)

### `meta_audiences`
- `id, segment_key text unique, segment_name, segment_query text, segment_kind text ('user_list'|'meta_rule_based')`
- `meta_audience_id, meta_audience_name, meta_lookalike_id, lal_ratio numeric default 0.01`
- `enabled bool, create_lal bool, sync_cadence text ('weekly'|'monthly')`
- `last_sync_at, member_count int, notes text`
- **RLS**: SELECT for `can_view_kennel`; INSERT/UPDATE/DELETE only for `is_ad_ops` (which already includes admin/owner)

### `meta_audience_sync_runs`
- `id, segment_id fk, started_at, completed_at`
- `records_pushed int, status text ('success'|'error'|'skipped_too_small'|'skipped_no_token')`
- `executed_sql text` (exact SQL run, for audit)
- `error_message text`
- RLS: read = `can_view_kennel`; writes service-role only

### `kennel_insights`
- `id, created_at, insight_type, scope_key text, title, summary, data jsonb`
- `severity text ('info'|'warning'|'opportunity'|'high'|'medium'|'low')`
- `source text ('internal'|'lindy_external'), urgency text, source_url text, expires_at`
- `actioned bool default false, actioned_at, actioned_by uuid`
- **Unique index**: `(insight_type, scope_key, date_trunc('day', created_at))` for dedupe
- For trend-type insights, `data` MUST include `daily_values: number[14]` (UI sparklines read this directly)
- RLS: read = `can_view_kennel`; insert/update = `is_ad_ops` + service-role; Lindy webhook uses service-role

### Read-only SQL executor
- Postgres role `meta_segment_runner` with SELECT only on `vs_transactions` + `sku_catalog`
- SECURITY DEFINER function `run_meta_segment_sql(_sql text)` that:
  - rejects anything not starting with `SELECT`
  - `SET LOCAL statement_timeout='30s'`
  - `SET LOCAL transaction_read_only=on`
  - executes as `meta_segment_runner` via `SET LOCAL ROLE`
  - returns `(email text, phone text, first_name text, last_name text, city text, state text, zip text)`
- Only ad_ops can EXECUTE this function

## Edge functions

### `meta-audience-segments`
- GET list / POST create / PATCH update / DELETE
- ad_ops-only (verify via `is_ad_ops`)
- Validates SQL passes `run_meta_segment_sql` dry-run (LIMIT 1) before save

### `meta-audience-sync`
- Pulls segment via `run_meta_segment_sql`
- SHA-256 hash email (lowercase+trim) and phone (E.164 digits-only)
- POSTs to `/v21.0/act_{ID}/customaudiences/{aud}/users` in 10k batches
- Creates audience first if `meta_audience_id` null
- **LAL guard**: if `member_count < 100` AND `create_lal=true`, skip LAL, log `status='skipped_too_small'`
- If `META_SYSTEM_USER_TOKEN` missing → log `skipped_no_token`, return 200 with warning
- Writes full `executed_sql` to `meta_audience_sync_runs`

### `kennel-trend-scan` (nightly 03:30 UTC)
- **Rising SKU**: 7d order count vs prior 30d daily-avg per SKU; flag >25% lift (no impressions denominator)
- **Geo spike**: 7d vs prior 30d state+zip; flag >2x
- **Peak windows**: top-3 (dow, hour) by order count, rolling 90d
- **Cohort reactivation**: customers tagged Lapsed who ordered in last 7d; flag if >5
- **Fast 2nd-order velocity**: median time-to-2nd-order, 30d vs 90d
- **AOV trend**: 7d rolling vs 30d baseline, ±10%
- **SKU affinity**: top-3 co-occurrence pairs within 30d
- All trend insights write `daily_values: number[14]` to `data`
- Upsert deduped on `(insight_type, scope_key, current_date)`

### `kennel-external-signal` (POST)
- Auth: `x-kennel-signature` HMAC using **`KENNEL_EXTERNAL_SIGNAL_SECRET`** (not the ingest secret)
- Zod-validated payload (signal_type, title, summary, source_url?, urgency, suggested_action?, expires_at?)
- Writes to `kennel_insights` with `source='lindy_external'`

### `kennel-export` update
- Add `kennel_insights` to `DATASETS` map so Lindy can read nightly

## Cron (pg_cron via insert tool)
- `kennel-trend-scan-nightly`: `30 3 * * *`
- `meta-audience-sync-weekly`: `0 4 * * 1` → loops segments where `sync_cadence='weekly'` (Recent Buyers, Lapsed, Abandoned Checkout)
- `meta-audience-sync-monthly`: `0 4 1 * *` → loops segments where `sync_cadence='monthly'` (VIPs, varietal, stable ones)

## Seed segments (with revised defaults)
| segment_key | cadence | lal_ratio | create_lal |
|---|---|---|---|
| all_wine_buyers_24mo | monthly | 0.03 | true |
| wine_club_members | monthly | — | false |
| high_historical_revenue (renamed from "VIPs > $500 LTV") | monthly | 0.01 | true |
| top_quintile_historical_revenue | monthly | 0.01 | true |
| lapsed_buyers_90d | weekly | — | false |
| recent_buyers_30d | weekly | — | false (exclusion list) |
| high_aov_single_buyers | monthly | 0.03 | true |
| red_wine_buyers | monthly | 0.05 | true |
| white_rose_buyers | monthly | 0.05 | true |
| case_buyers | monthly | 0.05 | true (LAL skipped if <100) |
| fast_second_order | monthly | 0.03 | true (LAL skipped if <100) |
| meta_video_75_180d | — | — | false (meta_rule_based) |
| meta_abandoned_checkout_14d | weekly | — | false (meta_rule_based) |
| meta_pdp_visitors_30d | weekly | — | false (meta_rule_based) |

Color/varietal segments JOIN `sku_catalog` (no hardcoded SKU strings).

## UI

### `/crm/meta-audiences` (CrmLayout, ad_ops only)
- Segment table: name, kind, cadence, member count, last sync, LAL status, "Sync Now", Meta Ads Manager deep link
- Expandable sync history per segment (last 5 runs incl. `executed_sql` preview + status badges)
- Add/edit modal with SQL editor (validates via dry-run before save)
- Global "Sync All" button
- Banner if `META_SYSTEM_USER_TOKEN` missing

### `/kennel/insights` (kennel nav, can_view_kennel)
- Card feed, severity→recency sort
- Filter bar: type, severity, source, actioned/unactioned
- 14-day inline SVG sparklines for trend cards (reads `data.daily_values`)
- External signals card group with urgency badge + source URL
- **Action button = mark actioned only** (no auto-rec creation this round, per Claude's sequencing note)
- Add nav entries to CRM + Kennel sidebars; register routes in `App.tsx`

## What you'll get
- 4 edge functions + cron + 2 routes
- Lindy handoff message with HMAC contract for `kennel-external-signal`
- Status banner if Meta token not yet set

Proceeding on green light. Step 1 = schema migration (after I query `vs_transactions` to confirm column names so the segment SQL is correct on first try).
