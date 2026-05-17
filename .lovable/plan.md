# Kennel Phase 2 — Cross-Channel ROAS Optimization Engine

Revised from Claude's spec with your four answers locked in:
- UTM tagger built as part of True ROAS foundation (GTM Tag 92 = May 15 cutoff)
- Approvals route through existing `kennel_review_recommendation` RPC + UI; SMS/email notify only
- Holdout group baked in from day one
- Dog Mom isolated in its own ad set; separate A+ campaign for prospecting

## Build order (sequential — each unlocks the next)

### Ship 1 — True ROAS foundation (blocker for everything)
- **DB**: `paid_link_tags` (utm builder registry), `channel_attribution_events` (raw clicks + conversions), `channel_performance_daily` (materialized view: spend, attributed revenue, true ROAS by channel/campaign/day), `holdout_assignments` (visitor_id → in/out, 5% suppression)
- **Edge fn `kennel-utm-tagger`**: generates canonical UTMs for every paid destination URL, stores in registry, exposes `/build` endpoint the channel UIs call when creating ads
- **Edge fn `kennel-attribution-rollup`**: nightly job — joins Vinoshipper orders to last-click UTM from `channel_attribution_events`, writes `channel_performance_daily`. Pre-May 15 orders flagged `attribution_quality='partial'`
- **Holdout**: deterministic hash(visitor_id) % 100 < 5 → holdout. Suppressed from all paid audiences, tracked for incrementality reporting
- **UI**: `/kennel/true-roas` dashboard — channel ROAS (platform-reported vs. true), holdout lift, attribution quality flag

### Ship 2 — Meta CAPI sender (parallel with Ship 1, no dependency)
- **Edge fn `meta-capi-sender`**: triggered on every new Vinoshipper order webhook
- Sends `Purchase` event with hashed `em`, `fbc` (from existing Z3a cookie capture), `value`, `currency`, `order_id` as dedup key
- Logs every send to `meta_capi_events` with response code for debugging
- **Retry queue** via existing pgmq pattern for failed sends

### Ship 3 — Customer Value Scorer + segments
- **DB**: `customer_segments` (user_id, segment, score, predicted_ltv_90d, last_scored_at)
- **Edge fn `customer-value-scorer`**: nightly — pulls Vinoshipper customer history, computes purchase count / AOV / wine club / recency / predicted 90d LTV, assigns segment (Champion / Loyalist / At-Risk / Lost), upserts
- **UI**: `/kennel/segments` — segment counts, LTV distribution, sample customers

### Ship 4 — Audience upload jobs (uses #2 + #3)
- **Edge fn `audience-sync-google`**: builds Customer Match list from Champions + Loyalists, uploads via Google Ads API, sets +30% bid multiplier on Leads-Search-14
- **Edge fn `audience-sync-meta`**: builds Champions custom audience + 1% LAL seed, uploads via Meta Marketing API monthly
- **Edge fn `audience-sync-suppress`**: Lost + 30d-recent-purchasers → exclusion audiences on both platforms
- Schedule: weekly Sunday 2am ET via pg_cron

### Ship 5 — Reallocation engine + execution arbiter
- **DB**: `reallocation_decisions` (rule_id, source_channel, dest_channel, amount_cents, pre_roas, post_roas, status, approved_by, executed_at), `budget_snapshots` (hourly state), `ad_execution_locks` (entity_key → locked_until, owner)
- **Edge fn `kennel-reallocator`**: implements priority rules 0–5 from spec
  - Emergency ROAS protection: real-time on webhook
  - Routine: daily 5am ET only (revised from 2x/day to avoid learning-phase whiplash)
  - Weekly: Monday 5am ET
- **Arbiter**: shared lock table — keyword engine and reallocator both acquire `entity_key` lock before mutation, 1hr cooldown
- **Approvals**: cross-platform moves + >$500 single-day shifts → insert into `ad_recommendations`, surface via existing `KeywordEnginePanel` pattern (rename → `AdOpsActionsPanel`), use existing `kennel_review_recommendation(_action, _notes)` RPC. Notification edge fn sends email/SMS but action happens in UI only
- **Kill switch**: `app_settings.kennel_auto_execute = false` halts all auto-execution; reply-"pause" updates this setting

### Ship 6 — Google tROAS + LTV-as-conversion-value
- **Edge fn `google-troas-setter`**: switches Leads-Search-14 to tROAS at 1800% start (not 1500% — that throttles), weekly step-down based on actual headroom
- **OCI enhancement**: send predicted_ltv_90d from `customer_segments` as `conversion_value` to existing OCI upload (Z3) instead of order subtotal. Same for CAPI in Ship 2 (retro-update)
- **Mission keyword guard**: hardcoded keyword list — any mutation requires `kennel_review_recommendation` approval, no exceptions

### Ship 7 — Campaign windows + Instacart reactivation
- **DB**: `campaign_windows` (name, start_at, end_at, channels, holiday_tag, budget_floor_cents, manual_override)
- **UI**: `/kennel/campaign-windows` CRUD
- **Reallocator** reads windows for Rule 3 (Instacart holiday activation at $50/day floor)

### Ship 8 — Platform expansion scaffold (TikTok first)
- Only enabled when Meta true ROAS > 4x for 30 consecutive days (gated by `channel_performance_daily` query)
- Scaffold-only: connector stub, audience sync stub, no auto-spend until manual enable

## Technical details

**Arbiter pattern** (critical — shared between keyword engine and reallocator):
```text
acquire_lock(entity_key, owner, ttl) → bool
  INSERT ... ON CONFLICT DO UPDATE WHERE locked_until < now()
```
Every mutation path (`kennel-keyword-engine`, `kennel-reallocator`, future fns) calls this before touching Google/Meta/Instacart APIs.

**Holdout integration**: existing `useAnalyticsTracking` hook checks `holdout_assignments` on first visit, sets `data-holdout` attr. Audience sync fns exclude holdout user_ids from every Customer Match / Custom Audience upload.

**Attribution model v1**: last-click within 7d window, UTM-required. Orders without UTM match → `attribution_quality='unmatched'`, surfaced in dashboard. Multi-touch deferred to v2.

**Tables added (8)**: `paid_link_tags`, `channel_attribution_events`, `channel_performance_daily` (matview), `holdout_assignments`, `customer_segments`, `meta_capi_events`, `reallocation_decisions`, `budget_snapshots`, `ad_execution_locks`, `campaign_windows`. All `is_ad_ops` RLS.

**Edge functions added (9)**: `kennel-utm-tagger`, `kennel-attribution-rollup`, `meta-capi-sender`, `customer-value-scorer`, `audience-sync-google`, `audience-sync-meta`, `audience-sync-suppress`, `kennel-reallocator`, `google-troas-setter`.

**Cron jobs (4)**: attribution rollup nightly 1am, customer scorer nightly 2am, audience sync Sunday 2am, reallocator daily 5am + Monday 5am weekly.

## Out of scope (Phase 3)
- Multi-touch attribution
- Amazon DSP, Pinterest, Yahoo connectors (scaffold only when triggers hit)
- Affiliate/Impact.com activation (separate workstream — coordinate with Ambassador program to prevent double-pay)
- Meta CAPI for non-purchase events (AddToCart, InitiateCheckout)

## Open questions before Ship 1
1. **Vinoshipper order webhook** — does it exist today, or do we need to poll? CAPI + attribution rollup both need near-realtime order signal.
2. **OCI Pending** — is the Google Offline Conversion Import (Z3) actually uploading today, or stalled? Ship 6 LTV swap depends on it.
3. **GTM Tag 92** — can I see the tag template? Need to confirm UTM param names match what `kennel-utm-tagger` will generate.

Ship 1 is ~2-3 days of work. Want me to start there, or answer the open questions first?
