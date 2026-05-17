---
name: Vinoshipper Polling + LTV CAPI
description: 15-min poller mirrors VS orders into vs_transactions and fires Meta CAPI Purchase + Subscribe events with LTV-weighted values
type: feature
---
Vinoshipper has no outbound webhook (poll-only API). Edge function `vinoshipper-poll`
runs every 15 min via pg_cron (`vinoshipper-poll-15min`), authenticated with
`KENNEL_INGEST_SECRET`.

Pipeline:
1. POST `https://vinoshipper.com/api/v3/p/orders/search` with `{limit:100,offset:0}` using Basic auth from `VINOSHIPPER_API_KEY_ID:VINOSHIPPER_API_SECRET`.
2. Dedupe against `vs_transactions.invoice` (UNIQUE). VS returns one row per line item — collapse by invoice before upsert.
3. For each net-new order: fire Meta CAPI + GA4 `Purchase` via `_shared/serverConversions.ts` (event_id = invoice for Pixel dedup).
4. For wine club orders (club object present or cartType matches /club|member/i): fire additional Meta `Subscribe` event with **static $400 projected LTV** (`STATIC_CLUB_LTV_CENTS = 40000`).

LTV is a placeholder — replace once vs_transactions has 30+ days of fresh per-customer revenue data.

Coexists with Z3a's daily 1:30am ET poll → Google Sheets. Z3a dedupes on order_id from OCI Pending sheet; we dedupe on `vs_transactions.invoice`. No collision.

Observability: `vs_poll_log` table (admin-readable) — orders_seen, orders_new, capi_purchases_sent, capi_subscribes_sent, ltv_value_sent_cents, error.
