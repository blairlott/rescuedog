# State-Weighted CAPI Signal Amplification

Lindy's spec assumes a greenfield CAPI setup. This project already has the moving parts: `vinoshipper-poll` fires Purchase + Subscribe to Meta via `_shared/serverConversions.ts`, `meta_capi_events` logs every fire, `meta-audience-sync` pushes hashed audiences. To avoid duplication and dual sources of truth, I'll layer the state-weighting logic onto what exists rather than build parallel tables and functions.

## What I'll build

### 1. Schema: `state_margin_tiers` (one new table)

- `state_code` (PK, 2-letter), `tier` int, `multiplier` numeric(3,2), `notes`, `updated_at`
- Seed all 50 + DC: Tier 1 (1.20x) for CA, TX, FL, NY, WA, CO, IL, GA; Tier 3 (0.80x) for MT, WY, ND, SD, ID, AK; Tier 2 (1.00x) default for the rest
- RLS: read for ad_ops + executive, writes service-role only
- Skip the separate `capi_event_log` table — `meta_capi_events` already logs every CAPI fire with status/payload/response. I'll add three nullable columns to it: `state TEXT`, `raw_value_cents INT`, `multiplier NUMERIC(3,2)`. Same data, one source of truth, existing dedup unchanged.

### 2. `vinoshipper-poll` — state-weight Purchase + Subscribe values

In-place modification:

- Resolve ship-to state per order, look up multiplier (fallback 1.00)
- `weighted_value_cents = round(base_cents * multiplier)` where base = `order_total` for Purchase, `STATIC_CLUB_LTV_CENTS` for Subscribe
- Pass `weightedValueCents` + `state` + `rawValueCents` + `multiplier` into `forwardPurchaseConversion` and `sendMetaSubscribe` so Meta receives the weighted value but `meta_capi_events` records both raw and weighted
- `event_id` stays `orderId` / `sub-{orderId}` — those are the existing dedup keys the browser pixel + repeat polls already use. Changing the format to `rdw_{id}_purchase_{ts}` would break dedup with the pixel. (Calling this out because it directly contradicts Lindy's spec; happy to reverse if you want a clean cutover.)
- Add `st` to Meta `user_data` (sha256 of lowercase 2-letter) where missing

### 3. New edge function: `capi-midfunnel-events`

- Public POST (verify_jwt = false), CORS enabled
- Body: `event_name` ('ViewContent' | 'InitiateCheckout'), `email?`, `phone?`, `state?`, `page_url`, `product_id?`, `value_cents?`, `fbp?`, `fbc?`
- Look up state multiplier; weight `value_cents`; hash PII; fire to Meta CAPI; log to `meta_capi_events` (event_id = `mf_{sha256(email||visitor)}_{event_name}_{unix}`)
- Wire up `metaPixel.ts` to call it from `ProductDetail` (ViewContent) and `CartDrawer` checkout handoff (InitiateCheckout)

### 4. Monthly Tier-1 audience export

Add a new row to `meta_audience_segments` (`segment_key = 'highmargin_tier1'`, cadence `monthly`, `segment_query` = SELECT email/first_name/last_name/phone FROM vs_transactions WHERE upper(ship_to_state) IN (8 tier-1 codes) AND transaction_date >= now() - 365 days), then schedule it via existing `meta-audience-sync` invoked by the existing monthly cron. No new sync function needed — `meta-audience-sync` already handles `/users` replacement, hashing, batching, and logging to `meta_audience_sync_runs`.

If a monthly cron row doesn't exist yet I'll add one in the same migration.

## Files

- `supabase/migrations/<ts>_state_margin_tiers.sql` — table + seed + RLS + columns on `meta_capi_events` + audience segment row + monthly cron
- `supabase/functions/vinoshipper-poll/index.ts` — weighting logic
- `supabase/functions/_shared/serverConversions.ts` — accept `rawValueCents` + `multiplier` + `state` and persist via meta-capi-sender
- `supabase/functions/capi-midfunnel-events/index.ts` — new
- `supabase/config.toml` — register new function with `verify_jwt = false`
- `src/lib/metaPixel.ts` (+ small callers in ProductDetail / CartDrawer) — fire mid-funnel events

## Open questions before I touch code

1. **Event ID format**: keep existing (`orderId` / `sub-{orderId}`) for pixel dedup — OR switch to Lindy's `rdw_{id}_{event}_{ts}` and accept double-counting risk on the cutover window?
2. **Weighted value to Meta**: send the weighted value as the public `value` field (Lindy's intent — biases optimization) and stash raw separately — confirm.
3. **Mid-funnel client wiring**: hook `ViewContent` on PDP mount and `InitiateCheckout` on Vinoshipper handoff — correct surfaces?
