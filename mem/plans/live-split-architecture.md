---
name: Live Split Architecture
description: Wine and Merch deploy as TWO separate Lovable projects with separate Cloud DBs. DNS cutover at the end. No Shopify publishing — fully native.
type: constraint
---

# Live Split Architecture

**Two Lovable projects at launch, not one:**

| Project | Domain (target) | DB | Scope |
|---|---|---|---|
| Wine (this project's lineage) | rescuedogwines.com | this Supabase | Wine catalog, club, CRM, ambassadors, locator, donations |
| Merch (new project, to be remixed/split) | merch domain TBD | NEW Supabase | merch_products, merch_bundles, dropship orders, marketplace partners |

**Rules:**
- NEVER publish to Shopify. Shopify is sunset; any remaining Shopify code is migration-only.
- All catalog data is native in Lovable Cloud (Supabase).
- Vinoshipper is the ONLY external system, and only for wine checkout/compliance/payments.
- Merch checkout will be native (Vinoshipper drop-ship bridge or Stripe — TBD), not Shopify.
- DNS for both domains transfers to the respective Lovable projects at cutover (Project Settings → Domains on each).
- Shared concerns (auth, CRM, ambassadors) stay on the wine project DB; merch project reads via API/edge function if needed, not via shared DB.

**Order of operations:**
1. Finish merch boutique relaunch sprints in this project (current work).
2. Spin up new Lovable project for /merch; migrate merch_products + merch_bundles + dropship tables.
3. Wire cross-project auth bridge if needed (or keep merch logged-out / email-checkout).
4. Point DNS for each domain at its Lovable project.
