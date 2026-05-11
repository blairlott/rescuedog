---
name: Dropship Architecture
description: Unified Vinoshipper cart with vendor-routed fulfillment (Printify, partner-direct, VS warehouse)
type: feature
---
# Dropship Architecture

## Single cart rule
ALL checkout (wine + merch + POD) goes through Vinoshipper. No separate Stripe/site cart for merch. Every sellable SKU must exist as a Vinoshipper product (wine or non-wine).

## Fulfillment routing
`dropship_skus.fulfillment_mode` decides who ships after Vinoshipper captures payment:
- `vinoshipper_warehouse` — licensed warehouse picks & ships (wine + co-warehoused merch). VS handles natively.
- `printify` (and other POD: `printful`, `gooten`) — `dispatch-fulfillment` edge function POSTs order to vendor API, vendor ships direct to customer, tracking webhook updates `dropship_orders`.
- `partner_direct` — Resend email PO to partner.contact_email, manual tracking entry.

## Catalog sync
Each non-VS vendor needs a "Import to Vinoshipper" flow in `/dropship` SkusTab:
1. Pull vendor catalog (e.g., Printify `/v1/shops/{id}/products.json`)
2. Admin selects SKUs + sets retail price
3. Dual-write: create as non-wine product in Vinoshipper + insert `dropship_skus` row linking `vinoshipper_product_id` ↔ `partner_id` ↔ vendor SKU
4. Inventory: POD = infinite, partner_direct = manual or webhook-synced

## Reconciliation
Vinoshipper collects payment + remits. Cost tracked per-SKU in `dropship_skus.cost_cents`. Payouts to vendors (Printify auto-charges card on file; partner_direct via `dropship_payouts`).

## Vendor types on partners table
`dropship_partners.vendor_type`: `vinoshipper_warehouse | printify | printful | gooten | partner_direct`. Unlocks vendor-specific credential fields in PartnersTab.
