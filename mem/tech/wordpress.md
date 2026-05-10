---
name: WordPress on Cloudways
description: Self-hosted WP (Cloudways) is the CMS source of truth for marketing pages, blog, and wine product copy joined by SKU.
type: feature
---

# WordPress on Cloudways

## Role
Replaces Shopify CMS bits and the Supabase `cms_content` table over time.
Vinoshipper owns wine SKU/price/inventory; WP owns the rich content.

## Hosting
- Live + dev on **Cloudways**.
- Self-hosted WP (not WordPress.com) → use `/wp-json/wp/v2/` REST API.
- Plugins required: ACF (Advanced Custom Fields), Custom Post Type UI.
- Custom Post Type `wines` with ACF fields: `sku` (Text), `tasting_notes`, `food_pairing`, `awards` (Repeater), `vintage`.

## Integration shape
- Frontend reads via React Query hooks in `src/hooks/useWordpress.ts`:
  - `useWpPage(slug)` — marketing pages (home, about, mission, vineyard, events).
  - `useWpPosts(n)` / `useWpPost(slug)` — blog at `/blog`.
  - `useWpWine(sku)` — joins WP copy to a Vinoshipper SKU.
- `useCmsContent(page)` now reads WP first, falls back to legacy `cms_content` table. Writes still target Supabase until WP editor training.

## Simulation mode
- `WP_SIMULATION = true` in `src/lib/wordpressConfig.ts` → mock dataset in `src/lib/wpMockData.ts`.
- To go live: paste Cloudways URL into `WP_BASE_URL`, set `WP_SIMULATION = false`.
- Writes from edge functions use Application Password (basic auth header).

## Endpoints used
- `GET /wp-json/wp/v2/pages?slug=...`
- `GET /wp-json/wp/v2/posts?per_page=10&_embed`
- `GET /wp-json/wp/v2/posts?slug=...&_embed`
- `GET /wp-json/wp/v2/wines?slug={SKU}`

## To-dos before live cutover
1. Cloudways staging URL.
2. Application Password generated for an editor account.
3. ACF + CPT UI installed; CPT `wines` created.
4. Re-export current cms_content rows into matching WP pages.
