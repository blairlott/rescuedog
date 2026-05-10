## Goal
Remove Shopify completely from the codebase and replace it with:
1. A native product/content layer powered by WordPress (Cloudways) for wine + marketing copy
2. Vinoshipper for all wine commerce (cart, checkout, payments, fulfillment)
3. A new in-app **Drop Shipper Admin Dashboard** to manage merch fulfillment partners, SKUs, orders, and payouts — replacing what Shopify previously did for `/merch`

Drop-ship credit card processing will route through Vinoshipper as non-wine SKUs (per prior decision), with the dashboard tracking which partner fulfills which SKU.

---

## Phase 1 — Rip Shopify out

**Code removals**
- Delete `src/lib/shopify*`, `src/stores/cartStore.ts` (Shopify cart), `src/hooks/useShopify*`, any `STOREFRONT_QUERY` / `cartCreate` logic
- Strip Shopify imports from `ProductCard`, `ProductDetail`, `CartDrawer`, `Shop` page, `/merch`
- Remove Shopify env constants, storefront token usage, and `shopify-cart` localStorage key
- Remove Shopify mentions from CMS/admin UIs
- Disconnect Shopify store via `shopify--disconnect_store` (last step, after code is clean)

**Data layer swap**
- Wine catalog → Vinoshipper API (already in progress) joined with WP custom post type `wines` by SKU for rich copy
- Merch catalog → new Supabase tables (below), checkout via Vinoshipper as non-wine SKUs
- Marketing pages/blog → WP REST (`wp-json/wp/v2`) with simulation adapter until Cloudways creds are wired

**Cart**
- Single unified cart, Vinoshipper-backed (wine + merch SKUs in one order)
- Drop-ship items flagged in cart metadata so the dashboard can route fulfillment

---

## Phase 2 — Drop Shipper Admin Dashboard

New route: `/crm/dropship` (admin/owner + new `dropship_manager` role)

**Pages**
1. **Partners** — list/create/edit drop-ship partners (Printful, Printify, custom, etc.): name, contact, API base URL, webhook secret, payout terms, status
2. **SKUs** — map merch SKU → partner + partner_sku + cost + retail + margin; bulk import CSV; sync button
3. **Orders** — every Vinoshipper order containing a drop-ship SKU, with status (new → submitted → in_production → shipped → delivered → exception), tracking, partner order ID, customer address (read-only)
4. **Payouts** — monthly partner reconciliation: orders fulfilled, cost owed, payout status, mark paid + attach receipt
5. **Activity log** — webhook events, manual notes, exceptions

**Backend**
- New tables: `dropship_partners`, `dropship_skus`, `dropship_orders`, `dropship_order_items`, `dropship_payouts`, `dropship_events`
- RLS: only `dropship_manager`, `admin`, `owner` can read/write
- Add `dropship_manager` to `app_role` enum + `is_dropship_manager(_user_id)` security-definer fn
- Edge functions:
  - `vs-order-webhook` → on Vinoshipper order, create `dropship_orders` rows for any drop-ship SKU
  - `dropship-submit` → push order to partner API (stub adapters for Printful/Printify/manual)
  - `dropship-status-sync` → cron pull tracking + status from partners
- Resend email to partner on new order (configurable per partner)

**UX features**
- Inline status updates with optimistic UI
- CSV export of orders + payouts
- Filters: partner, status, date range
- Real-time order list via Supabase realtime
- Bulk actions: mark shipped, retry submission, void

---

## Phase 3 — Cleanup & verify
- Remove Shopify rows from `mem://` and `mem/plans/post-vs-golive.md`
- Update brand/feature memory: merch path = Vinoshipper SKUs + drop-ship dashboard
- Remove Shopify connector
- Smoke test: wine PDP, merch PDP, unified cart → VS checkout, admin dashboard CRUD, webhook simulation

---

## Build order (recommended)
1. Migration: roles + dropship tables + RLS  ← needs your approval
2. Dashboard UI scaffold with simulated data (so you can click through today)
3. Rip Shopify from frontend (cart, product pages, /merch)
4. Wire WP simulation adapter for marketing/blog/wine copy
5. Edge functions + webhook + Resend
6. Disconnect Shopify store, remove deps

---

## Open decisions before I start
- Which drop-ship partners to wire first (Printful most common, Printify second)?
- Should the dashboard live under `/crm/dropship` or a new top-level `/admin/dropship`?
- For merch checkout via Vinoshipper: confirm you want a single unified cart vs. a separate merch-only checkout

I'll ask these via questions tool once you approve the plan, then start with the migration.
