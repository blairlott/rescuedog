---
name: v3 Shopify → Vinoshipper Merch Migration
description: Plan for porting existing Shopify-hosted dropship partners and SKUs to Vinoshipper non-wine products without losing fulfillment continuity.
type: feature
---
# Shopify → VS Merch Migration Plan

## TL;DR
**Yes — we can migrate the current dropship partners.** The hard work is already done: every active partner and SKU lives in our DB (`dropship_partners`, `dropship_skus`), not in Shopify. Shopify is just the *storefront/checkout* for these SKUs today. Migration = provision each SKU as a non-wine product in VS and flip the storefront read path.

## What we keep
- `dropship_partners` rows (Printify, Printful, Sticker Mule, 4imprint, etc.) — vendor_type, credentials, simulation_mode all survive untouched.
- `dropship_skus` rows — cost/retail/margin/curation rules all survive untouched.
- `dispatch-fulfillment`, `merch-curation-scan`, `merch-curation-apply` edge functions.
- Marketplace partner application flow (`/sell`).

## What changes
| Field | Today | After v3 |
|---|---|---|
| Storefront for merch | Shopify product handle | `dropship_skus.vinoshipper_product_id` + Injector |
| Cart / checkout | Shopify cart `checkoutUrl` | VS Injector cart drawer |
| Payment | Shopify Payments | Vinoshipper / VS-side Stripe |
| Order created in | `shopify orders` | `dropship_orders` (from VS webhook) |
| Fulfillment dispatch | Shopify webhook → dispatch-fulfillment | VS webhook → vs-dropship-bridge → dispatch-fulfillment |

## Provisioning steps (per partner)
1. **Run dry-run planner** — `shopify-to-vs-merch-migrate` edge fn lists every active SKU and categorizes:
   - `create_in_vs` — never been provisioned (no `vinoshipper_product_id`) or was simulated (`vs_sim_*`)
   - `skip` — already has a real VS product ID
2. **Operator review in `/v3/admin/migration`** — confirms SKU titles, retail prices, partner mapping.
3. **Flip planner from `dryRun=true` to `dryRun=false`** — creates non-wine products in VS via `/api/v3/products` (or producer-console batch import CSV if API doesn't yet support non-wine creation — confirm with VS rep).
4. **Tag each VS product** with `dropship:true` + `partner:<slug>` custom field for the bridge router.
5. **Smoke test** — buy one Printify SKU via /v3/shop → confirm VS captures payment → confirm vs-dropship-bridge forks to Printify → confirm tracking syncs back.

## Partners currently in scope
(From `dropship_partners` — confirm live list at migration time)
- Printify (Monster Digital FL, Swiftpod CA, MyLocker MI)
- Printful (Charlotte NC)
- Gooten (TN/OH/PA)
- Sticker Mule (Amsterdam NY)
- 4imprint (Oshkosh WI)
- 4inDogs (Pittsburgh PA)
- Discount Mugs (Medley FL)
- Candlefy (Brooklyn NY)

All are `fulfills_from_us=true` (required). All keep simulation_mode until their real API key + VS product ID are live.

## Marketplace partners (`/sell` applications)
Approved applicants currently get a draft `dropship_skus` row pointing at a Shopify-hosted product. Under v3, the approval flow creates the SKU *and* enqueues a VS provisioning job. No UX change for applicants.

## Rollback
- VS product creation is idempotent (we store `vinoshipper_product_id`).
- If migration goes wrong, flip `VITE_V3_DROPSHIP_ENABLED=false` — Shopify storefront for merch keeps working. No data is destroyed in either system.

## Open question for VS rep
- Can we bulk-import non-wine products via API, or is it producer-console CSV only? Affects how long the initial provisioning takes (~200 SKUs across partners).