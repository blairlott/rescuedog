## Instacart: friendly names + full optimization engine

### Part 1 — Friendly campaign/ad_group/product names

**Pull richer names from the API first**
- In `kennel-meta-browse`, expand the Instacart list mappers to surface every available human-readable field: `display_name`, `campaign_name`, `name_internal`, `product.brand_name`, `product.display_name`, `upc`. Pick first non-empty in priority order; fall back to ID only as last resort.
- Add a `raw` debug field (gated to admins) so we can see exactly what the API returns and align with your screenshots later.

**Add a manual alias layer (CSV + inline rename)**
- New table `kennel_entity_aliases` (platform, entity_type, entity_id, friendly_name, notes). Admin-only RLS via `is_ad_ops`.
- Merge aliases into the list responses — alias wins over API name.
- UI on `/kennel/channels?platform=instacart`:
  - Inline pencil-icon "rename" on each campaign / ad_group / product row.
  - "Import names" button → CSV uploader (`entity_type,entity_id,friendly_name`) with preview + dry-run + apply.
  - "Export current list" button so you can grab IDs, paste into a sheet, fill names, re-upload.
- After you send screenshots, we tune the API-name extraction rules.

### Part 2 — Programmatic optimization (parity with Google)

**Keyword engine** — already wired for Instacart; verify end-to-end and surface it from the Instacart ad-group detail view (same panel component, same approval flow).

**Daily budget pacing (`kennel-budget-optimizer` edge function, cron-driven)**
- Pulls 7-day rolling spend, revenue, ROAS per ad_group from `ad_metrics_daily`.
- For each campaign with `engine_enabled`:
  - Compute target = total campaign daily budget.
  - Allocate proportionally to `roas × conversion_volume`, with min/max guardrails per ad_group (configurable: floor, ceiling, max daily shift %).
  - Writes a `pacing_*` recommendation row (status=pending unless `auto_apply`).
- Apply path: PATCH `/ad_groups/{id}` with new `daily_budget_cents`, logs to `ad_execution_log`.

**Auto-pause zero-ROAS products**
- Same cron tick: any `ad_group_product` with spend ≥ threshold AND 0 conversions in lookback window → recommend `pause` (auto-apply if `auto_apply`).
- Reuses existing `pause_threshold_cents` / `pause_zero_conv_days` settings on the keyword-engine settings row, repurposed as global engine settings.

**Bid optimization (raise winners / lower losers)**
- For each ad_group_product with ≥ N clicks in window:
  - ROAS ≥ target × (1 + raise_gate%) → bump bid_micros by step (e.g. +15%, capped).
  - ROAS ≤ target × lower_gate% → cut bid (e.g. -20%, floored).
  - Gated by `max_daily_bid_changes`.
- All changes go through the same recommendations → execute pipeline (PATCH `/ad_groups/{id}` with new `default_bid_cents`).

**Settings UI** (extend the existing Keyword Engine settings dialog into a generic "Engine settings" dialog)
- Sections: Keywords · Budget pacing · Bid optimization · Auto-pause.
- Per-platform `engine_enabled`, `auto_apply`, target ROAS, guardrails.
- Surfaced on `/kennel/settings` plus the inline panel.

**Cron**
- `pg_cron` schedules `kennel-budget-optimizer` every 6h.
- All actions are idempotent (keyed by date + entity + rule) so a re-run never double-applies.

### Out of scope (call out, not building)
- Creating new campaigns/ad_groups (still manual in Instacart UI).
- Schedule/dayparting changes (Instacart Ads doesn't expose this on v3).

### Order of execution
1. Schema migration: `kennel_entity_aliases` + extend `kennel_engine_settings` with budget/bid fields.
2. `kennel-meta-browse`: richer name extraction + alias merge + alias CRUD endpoints.
3. UI: inline rename, CSV import/export modal on `/kennel/channels`.
4. `kennel-budget-optimizer` edge function (pacing + auto-pause + bid opt).
5. Wire Keyword Engine panel onto Instacart ad-group detail (if not already shown there).
6. Engine settings dialog: budget + bid sections.
7. Schedule cron (separate `supabase insert` call, not migration).
8. Smoke test against your live advertiser; you send screenshots to align names.

After you approve I'll start with the migration.