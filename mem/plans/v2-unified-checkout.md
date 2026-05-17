---
name: v2 Unified Checkout (Shopify payments + VS fulfillment)
description: Sandboxed /v2/* rebuild — Shopify takes the money, Vinoshipper handles compliance + fulfillment via API. Written VS approval in hand.
type: feature
---
# v2 Unified Checkout

RDW holds the winery license. VS is fulfillment + compliance partner via API
(NOT merchant-of-record). Shopify Payments charges the full cart. VS receives
wine lines as `paid:true` orders for shipping + state compliance reports.

## Isolation
- All UI under `src/v2/` (no imports out → in).
- `cartStoreV2` with localStorage key `rdw-cart-v2`.
- Feature flag `VITE_V2_STORE_ENABLED`; routes return 404 when off.
- Test SKUs tagged `v2-test` in Shopify; live `/merch` query unaffected.
- New edge fns only: `vs-compliance-check`, `shopify-order-router-v2`,
  `vs-fulfillment-bridge`. Existing VS code frozen.

## Flow
1. `/v2/cart` → user clicks Checkout
2. `/v2/checkout/verify` interstitial: DOB + ship-to address
3. Calls `vs-compliance-check` (wraps VS `POST /api/v3/p/orders/check-compliance`)
   → returns `{ allowed, blockedSkus, reasons, complianceToken, taxesCents, feesCents, shippingCents }`
4. If blocked → show "we can't ship X to {state}" + offer to remove
5. If allowed → write token + tax/fees/shipping line item to Shopify cart
   (`cartAttributesUpdate` + `cartLinesAdd`), then open `checkoutUrl` with
   `channel=online_store`
6. Shopify `orders/paid` webhook → `shopify-order-router-v2`:
   - Split lines (wine vs merch via tag/metafield)
   - Wine → VS `POST /api/v3/orders` with `paid:true`, `fees`, `taxes`,
     compliance token
   - Merch → existing fulfillment
7. VS webhooks (`TRACKING_NUMBER_ADDED`, `CARD_DECLINED`, `CANCELLED`)
   → `vs-fulfillment-bridge` updates Shopify fulfillment/refund

## Key decisions locked
- Excise/state alcohol tax = single Shopify line item ("Wine shipping, tax & fees")
- Compliance token TTL = 30 min
- Age recovery = surface VS `ageVerification.idScanUrl` from order response
- Address lock = re-validate in `orders/paid` webhook; auto-refund on mismatch
- Wine club = Shopify Subscriptions charges card; per-shipment push to VS

## Build order
1. ✅ Scaffold `/v2` routes + flag + cartStoreV2 + stub edge fn
2. Real `vs-compliance-check` (wire `_shared/vinoshipper.ts`)
3. Shopify product mirror sync for wine SKUs
4. `/v2/shop` unified catalog
5. Interstitial → cart attributes → checkoutUrl flow
6. `shopify-order-router-v2` webhook
7. `vs-fulfillment-bridge` (tracking/refund roundtrip)
8. Wine club bridge
9. QA matrix (3–5 states)
10. Cutover: swap routes, archive legacy, flip flag

## Open items for VS rep
- Confirm test SKUs we can use without affecting real reporting
- Idempotency key support on `POST /orders` (for webhook retries)
- Behavior when `paid:true` order fails compliance post-payment