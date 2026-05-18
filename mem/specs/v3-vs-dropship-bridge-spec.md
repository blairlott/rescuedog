---
name: v3 Vinoshipper Dropship Bridge — Spec
description: VS-as-merchant-of-record for wine + non-wine, with server-side fork of non-wine line items to Printify/Printful/partner_direct. Sandboxed at /v3/*.
type: feature
---
# v3 VS Dropship Bridge — Spec v0.1

**Status:** DRAFT (Lindy ops, Claude technical)
**Sandbox:** `/v3/*` routes, `cartStoreV3`, flag `VITE_V3_DROPSHIP_ENABLED`. Zero impact on production or /v2.
**Contrast with /v2:** /v2 = Shopify-as-MoR + VS for wine compliance. /v3 = VS-as-MoR for everything (single PCI scope, single cart drawer, single tax engine) with server-side dropship fork.

## 1. Goal
Single Vinoshipper checkout handles wine AND non-wine. Non-wine line items are forked at the `vs-dropship-bridge` edge function to the right partner (Printify, Printful, partner_direct) using existing `dropship_partners` / `dropship_skus` rows.

## 2. System map
```text
 Browser (/v3/*)
   │
   ├── VS Injector cart drawer (wine + non-wine)
   │     - Each card binds vs-add-to-cart to a VS productId
   │
   └── (post-payment, VS-side)
        VS webhook ORDER:APPROVED → /functions/v1/vs-dropship-bridge
          ├── GET /orders/{id} from VS
          ├── For each line:
          │     • match vinoshipper_product_id → dropship_skus
          │     • mode = vinoshipper_warehouse  → leave to VS
          │     • mode = printify/printful/partner_direct → fork
          ├── Insert dropship_orders row
          └── Invoke dispatch-fulfillment (existing edge fn)
        VS webhook ORDER:TRACKING_NUMBER → bridge
          └── Sync into dropship_orders (carrier/tracking_number)
        Partner tracking callback
          └── PUT /orders/{id}/tracking on VS (so customer sees unified shipment)
```

## 3. Data model (no schema changes required)
Existing tables cover everything:
- `dropship_partners` — vendor_type, vendor_credentials, simulation_mode, fulfills_from_us
- `dropship_skus` — vinoshipper_product_id, fulfillment_mode, partner_sku, vendor_variant_id
- `dropship_orders` — vinoshipper_order_id (already a column!), partner_order_id, simulated

## 4. Failure modes
| Scenario | Mitigation |
|---|---|
| VS webhook delayed | Daily reconcile: `dropship_skus` matching VS orders WHERE no `dropship_orders` row → enqueue |
| Partner API down | dispatch-fulfillment retries with exponential backoff; alert after 3 failures |
| Partner out of stock | merch-curation-scan flags SKU; bridge writes `dropship_orders.status='blocked'` and emails ops |
| Customer returns merch | Refund issued via VS (they hold the funds); ops reclaims from partner per their policy |
| Sales tax on non-alcohol merch | Confirm VS remits or whether separate state filing required (open question for accountant) |

## 5. Open questions for VS rep
1. Does VS issue a 1099-K split between alcohol and non-alcohol receipts?
2. Does the VS Injector cart drawer allow theming the "merchandise" label distinct from wine bottles?
3. Idempotency-key header for `PUT /orders/{id}/tracking` so we don't double-write on partner retries.

## 6. Rollout
1. Build behind flag (current phase).
2. Provision 3–5 test non-wine SKUs in VS producer console (hat, sticker, candle).
3. Wire `vs-dropship-bridge` to register against the existing `vinoshipper-webhook` router (sub-route) so we don't double-subscribe.
4. End-to-end QA: place sandbox VS order containing 1 wine + 1 Printify item → confirm Printify receives PO, tracking syncs back to VS.
5. Soft launch via feature flag for 5% of merch checkouts.
6. Cutover: redirect `/merch/checkout` from Shopify to VS Injector; archive Shopify merch backend.

## 7. What this replaces
- `/merch` Shopify cart `checkoutUrl` flow (kept until v3 passes 30-day QA)
- The simulated `sync-to-vinoshipper` path (becomes real)
- The Shopify-side dropship integration entirely