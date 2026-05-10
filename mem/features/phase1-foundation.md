---
name: Phase 1 Foundation (May 10)
description: Foundation tables, native locator, impact counter, feature flags, audit log, and content bridge built independently before May 18 Vinoshipper cutover
type: feature
---
**Built May 10 (independent of Vinoshipper):**

**DB tables:**
- `locator_searches` — every public locator query logged (zip, lat/lng, premise filter, results count)
- `retailer_suggestions` — public "stock my store" form submissions
- `audit_log` — actor, entity, before/after for every meaningful change
- `feature_flags` — admin-toggleable on/off (seeded: native_locator, impact_counter, partner_portal, ai_signal_engine, depletion_parser)
- `content_index` — WP bridge for blog/page sync (source, slug, title, body_html, tags, published_at)
- `impact_events` — rescue-funding ledger (bottles, donation_cents, rescue_partner_id)

**`sales_accounts` extensions:** `is_public`, `last_verified_at`, `dma`, `tags`. Anon can read where `is_public = true` (locator data only).

**RPC functions:**
- `compliant_retailer_set(lat, lng, min_count, premise_filter)` — returns 3+ unaffiliated public retailers ranked by distance. Used by every "where to buy" comm for tied-house compliance.
- `get_public_impact_totals()` — aggregate bottles/dollars/customers/rescues, no PII.

**Edge functions:**
- `geocode-zip` — Nominatim wrapper with in-memory cache, US zip → lat/lng/city/state.

**Pages:**
- `/where-to-buy` — native Leaflet locator, parallel to `/store-locator` (Grappos still live until cutover). Feature-flag controlled.
- `/admin/flags` — admin toggle UI for feature flags, writes to audit_log on every change.

**Components:**
- `<ImpactCounter />` — homepage block, gated by `impact_counter` flag, shows aggregate totals.
- `<SuggestRetailerDialog />` — anyone can submit; admins review in CRM.
- `useFeatureFlag(key)` hook — single source of truth for flag checks.

**What's NOT built (waiting on Vinoshipper docs/sandbox):**
- Vinoshipper webhook → orders/customers/impact_events sync
- Order replay / nightly reconciliation
- Real impact data (currently empty — counter shows 0 until VS sync)
- Partner portal full UI (scaffold only)

**Cutover plan (May 18+):**
1. Get VS API + webhook docs
2. Build vinoshipper-webhook handler → write to orders, order_lines, customers_synced, impact_events
3. Backfill 30 days of historical orders
4. Flip `impact_counter` flag once data flows
5. Mark public retailers (`is_public = true`) on top sales_accounts → flip `native_locator` flag → redirect /store-locator to /where-to-buy
