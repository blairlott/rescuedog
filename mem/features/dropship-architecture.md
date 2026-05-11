---
name: Dropship Architecture
description: Unified Vinoshipper cart with vendor-routed fulfillment (Printify, partner-direct, VS warehouse). Simulation mode until real API keys land.
type: feature
---
# Dropship Architecture

## Single cart rule
ALL checkout (wine + merch + POD) goes through Vinoshipper. No separate Stripe/site cart for merch. Every sellable SKU must exist as a Vinoshipper product (wine or non-wine).

## Fulfillment routing
`dropship_skus.fulfillment_mode` decides who ships after Vinoshipper captures payment:
- `vinoshipper_warehouse` — licensed warehouse picks & ships natively
- `printify` / `printful` / `gooten` — POD vendor receives auto-dispatched order, ships direct to customer
- `partner_direct` — Resend email PO to partner.contact_email, manual tracking entry

## Simulation mode (pre-May 18)
- `dropship_partners.simulation_mode` (default true) — when on, vendor API calls are mocked
- Edge functions check `simulation_mode` AND env var presence (e.g. `PRINTIFY_API_KEY`) — if either is sim, returns realistic mock data
- `dropship_orders.simulated` flag tracks whether an order was dispatched via mock or live
- `dropship_skus.vinoshipper_product_id` prefixed with `vs_sim_` indicates simulated sync
- Switch to live: add API key secrets, toggle `simulation_mode=false` on partner row

## Edge functions
- `printify-import-products` — lists vendor catalog (mock 4-product catalog when simulating)
- `sync-to-vinoshipper` — pushes SKU to VS as non-wine product, stores `vinoshipper_product_id`
- `dispatch-fulfillment` — routes by `vendor_type`, idempotent (skips if already dispatched), logs to `dropship_events`

## Vendor credentials
Stored in `dropship_partners.vendor_credentials` jsonb. Per vendor type:
- printify/printful/gooten: `{ shop_id, api_key_note }` (actual key as Lovable secret)
- vinoshipper_warehouse: `{ warehouse_code }`
- partner_direct: `{ po_format }`

## Admin UI in /dropship
- PartnersTab: vendor_type selector, dynamic credential fields, simulation toggle
- SkusTab: "Import from Vendor" modal, fulfillment_mode badge, "Sync to VS" button per row
- OrdersTab: "Dispatch" button when status=queued, shows fulfillment_status_detail badge with sim flag
