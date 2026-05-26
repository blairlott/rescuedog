## Goal

Replace the hardcoded hero variants on `/` and `/merch` with a CMS-managed, auto-rotating system that adds a fresh image each day, keeps proven winners "sticky," and lets owner/admin edit copy and upload images.

## Architecture

```text
DB: hero_variants ──┐                  cron (daily 09:00 UTC)
                    ├─► WineHero  ◄──  hero-daily-rotation edge fn
                    │     /merch       (auto-generates 1 new variant per surface,
                    └─► MerchHero      retires losers, locks winners as sticky)
                          ▲
storage: hero-images      │
   ▲                      │
   │ upload via CMS ──► /cms/heroes  (owner/admin only)
```

## Database (one migration)

- `hero_variants` — `id`, `surface ('wine'|'merch')`, `image_url`, `image_alt`, `eyebrow`, `headline_html`, `sub`, `cta_label`, `cta_href`, `status ('active'|'paused'|'retired')`, `sticky bool`, `auto_generated bool`, `created_by`, timestamps.
- Public can `SELECT` rows where `status='active'`; owner/admin can full CRUD via `has_role()`.
- Storage bucket `hero-images` (public read; owner/admin write).
- Helper RPC `get_active_hero_variants(_surface text)` — returns active rows ordered by sticky DESC, created_at DESC.

## Bandit logic (sticky + daily freshness)

In the existing `hero-attribution`/`get_hero_variant_stats` flow:
- Variants are picked by Thompson Sampling over **DB-loaded** variants instead of a hardcoded list.
- `sticky=true` variants are never auto-retired and get a +0.05 score boost (proven winners stay in rotation).
- A new edge function `hero-daily-rotation` runs nightly and:
  1. For each surface, calls Lovable AI (`google/gemini-3.1-flash-image-preview`) to generate one new on-brand image, uploads to `hero-images`, inserts a new `active` row with default copy.
  2. Marks any non-sticky variant with ≥1,000 impressions and CTR < (median × 0.6) as `retired`.
  3. Marks any variant with ≥1,000 impressions and CTR ≥ (top-quartile) as `sticky=true`.
- Cron scheduled via `pg_cron` + `pg_net` (uses `supabase--insert`, not migration, per project conventions).

## Frontend

- `WineHero.tsx` + `MerchHero.tsx` refactor: fetch active variants via the new RPC (with the existing hardcoded list as offline fallback). Bandit picks from the live list. Image+copy still rotate together per row (one image = one copy deck per row, matching the new DB model — simpler than the current cross-product).
- New page `src/pages/CmsHeroesPage.tsx` (route `/cms/heroes`, owner/admin gated):
  - Table grouped by surface (Wine / Merch) with thumbnail, copy fields, sticky toggle, status, impressions/clicks/CTR (joined from `get_hero_variant_stats`).
  - Inline edit modal: image upload (drag/drop → `hero-images` bucket), eyebrow, headline, sub, CTA label, CTA href, sticky toggle, status.
  - "Generate new variant now" button → calls `hero-daily-rotation` edge fn with `?surface=wine|merch`.
- Add link in `CmsDashboard.tsx` nav.

## Edge function

`supabase/functions/hero-daily-rotation/index.ts`:
- Header `x-cron-secret` check OR owner/admin JWT for manual trigger.
- Inputs: `{ surface?: 'wine'|'merch', manual?: boolean }`.
- Uses `LOVABLE_API_KEY` (already configured) for image generation.

## Out of scope

- No changes to existing `hero_events` table or analytics page (it keeps working; new variant IDs just flow in).
- No changes to wine/merch product data.
