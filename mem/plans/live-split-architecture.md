---
name: Live Split Architecture
description: Wine and Merch deploy as TWO separate Lovable projects with separate Cloud DBs. Two distinct domains. No shared cart/auth across domains. DNS cutover at end.
type: constraint
---

# Live Split Architecture (Option A — locked)

**Two Lovable projects, two databases, two domains. Wine leads.**

| Project | Domain | DB | Scope |
|---|---|---|---|
| Wine (this project) | rescuedogwines.com (primary) | this Supabase | Wine catalog, club, CRM, ambassadors, locator, donations, CMS |
| Merch (NEW project) | rescuedog.com | NEW Supabase | merch_products, merch_bundles, dropship orders, marketplace partners |

**Rules:**
- NEVER publish to Shopify. All catalogs native in Lovable Cloud.
- Vinoshipper = ONLY external system, wine checkout/compliance/payments only.
- NO shared cart across domains. NO shared auth across domains. Cookies are per-host.
- Cross-promo via header/footer cross-links only ("Shop Merch →" / "Shop Wine →"). User starts a fresh session on the other side.
- Each project has its own age-gate behavior: wine gates ON, merch gates OFF.
- Each project has independent CMS, analytics, GA4, Meta Pixel, GTM container.
- DNS transferred at cutover via Project Settings → Domains on each project.

**Why Option A (chosen):**
- Wine is the flagship business → deserves dedicated SEO authority on its own domain.
- Clean separation = no duplicate-content risk, no compliance leakage between alcohol/non-alcohol.
- Simpler ops: each project ships independently, one breaking the other is impossible.
- User mental model: "I came for wine" vs "I came for merch" — two distinct shopping intents.

**Order of operations:**
1. Finish merch boutique relaunch sprints in this project (current work).
2. Spin up new Lovable project for /merch; migrate merch_products + merch_bundles + dropship + marketplace tables to its own Supabase.
3. Strip merch routes/components from THIS project after merch project is live.
4. Add reciprocal header/footer cross-links on both sites.
5. DNS cut: rescuedogwines.com → wine project; rescuedog.com → merch project.
