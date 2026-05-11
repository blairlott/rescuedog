# Shopify Rip-Out → Lovable Native (Vinoshipper for wine, Supabase for merch)

## Decisions locked in
- **Storefront UI**: Lovable-native (React + Supabase), no Shopify SDK calls anywhere
- **Wine catalog source of truth**: Vinoshipper (fetched/cached server-side)
- **Merch catalog source of truth**: Supabase (`dropship_skus` already exists; extended for non-dropship merch)
- **Cart**: Lovable-native cart UI, persisted client-side + optional Supabase abandonment logging (already exists)
- **Checkout for wine**: deep link to Vinoshipper hosted cart with items pre-populated
- **Checkout for merch**: TBD in next phase (NOT covered here — placeholder "contact us"/coming-soon; no Stripe yet)
- **Compliance**: Vinoshipper handles age/state/tax/shipping/payment for wine
- **Existing Shopify products**: export to JSON archive AND seed `merch_products` Supabase table for the apparel/merch items

## Phase 1 — Export & archive (do first, while Shopify is still connected)
1. Run a one-shot export script that pulls all Shopify products (title, handle, description, images, variants, price, tags, vendor, product_type) via the existing Shopify connection and writes:
   - `/mnt/documents/shopify-export-2026-05-11.json` — full archive
   - `/mnt/documents/shopify-export-merch.json` — filtered to merch/apparel only (for Supabase seed)
2. Deliver both files as `<lov-artifact>` so the user has them before anything is removed.

## Phase 2 — New schema for Lovable-native catalog

```sql
-- Wine catalog cache (pulled from Vinoshipper, refreshed periodically)
CREATE TABLE public.wine_products (
  id uuid PK,
  vinoshipper_product_id text UNIQUE,
  handle text UNIQUE,        -- slug for URLs
  title text,
  varietal text,
  vintage int,
  description text,
  tasting_notes text,
  image_url text,
  gallery_urls text[],
  price_cents int,
  club_price_cents int,
  badges text[],             -- award badges (auto-styled)
  tags text[],
  in_stock bool,
  sort_order int,            -- enforces wine sort order memory
  vinoshipper_cart_url text, -- deep link target
  is_active bool,
  last_synced_at timestamptz,
  created_at, updated_at
);

-- Merch catalog (replaces Shopify for non-wine)
CREATE TABLE public.merch_products (
  id uuid PK,
  handle text UNIQUE,
  title text,
  description text,
  image_url text,
  gallery_urls text[],
  price_cents int,
  category text,             -- apparel, accessories, etc.
  collection text,
  tags text[],
  variants jsonb,            -- size/color options
  inventory_qty int,
  is_active bool,
  is_featured bool,
  sort_order int,
  created_at, updated_at
);
```
- Both tables: public read, admin write (RLS via `is_admin_or_owner`).
- Seed `merch_products` from Phase 1 export.

## Phase 3 — Vinoshipper integration (edge function)
- New edge function `vinoshipper-sync` — pulls wine catalog from Vinoshipper API into `wine_products` on a schedule + manual trigger button in CMS.
- Need user to confirm: **Vinoshipper API credentials** (we'll request `VINOSHIPPER_API_KEY` + producer ID via `add_secret` when ready).
- Each wine row stores its `vinoshipper_cart_url` (deep link with SKU + qty params per VS docs).

## Phase 4 — Frontend rip-out
Replace every `shopifyClient` / Storefront API usage:
- `src/lib/shopify*.ts` → delete
- `src/hooks/useShopify*.ts` → delete  
- `src/contexts/CartContext.tsx` → rewrite to operate on `wine_products` + `merch_products` rows; checkout button for wine items builds a Vinoshipper deep link
- `src/pages/Shop.tsx`, `ProductDetail.tsx`, `WineDetail.tsx`, `Merch.tsx` → query Supabase instead of Shopify
- `SommelierChat` + `ai-sommelier` edge function → swap Shopify catalog fetch for `wine_products` Supabase query
- Remove all `SHOPIFY_*` env references in edge functions
- `src/integrations/shopify/*` → delete

## Phase 5 — Cart & checkout UI
- Lovable-native cart drawer (already exists in design) — **no functional change to UI**, just data source
- "Checkout" button on wine cart: builds a single Vinoshipper deep link containing all wine SKUs + quantities, opens in new tab
- Mixed cart (wine + merch): show two checkout buttons with explanation ("Wine ships from our winery; merch ships separately")
- Merch checkout: temporary "Coming soon — contact us" until next phase

## Phase 6 — Cleanup
- Remove Shopify-related secrets from edge functions (keep secrets in Lovable Cloud for now — user can delete later)
- Update memory: replace Shopify references with Vinoshipper/Supabase
- Update README/docs sections referencing Shopify

## Technical details

**Files to delete (estimated):**
- `src/lib/shopify.ts`, `src/lib/shopifyClient.ts`, `src/lib/shopify-*.ts`
- `src/integrations/shopify/`
- `src/hooks/useShopify*.ts`, `useShopifyProducts.ts`, etc.
- Any `supabase/functions/shopify-*` edge functions

**Files to rewrite:**
- `CartContext`, `Shop`, `ProductDetail`, `WineDetail`, `Merch`, `SommelierChat`
- `ai-sommelier/index.ts` (already partially refactored — swap Shopify fetch → Supabase)

**New files:**
- `src/lib/vinoshipperCart.ts` — builds deep link URLs
- `src/hooks/useWineProducts.ts`, `useMerchProducts.ts`
- `supabase/functions/vinoshipper-sync/index.ts`
- CMS admin page: `/cms/catalog` for managing merch + triggering wine sync

## Order of execution
1. **Export Shopify data** (Phase 1) — non-destructive, deliver files first
2. **Create schema migration** (Phase 2) — request approval
3. **Seed merch_products** from export
4. **Ask user for Vinoshipper API credentials** (Phase 3 prerequisite)
5. **Build Vinoshipper sync** + run initial sync
6. **Rewrite frontend data layer** (Phase 4) — biggest chunk
7. **Update cart/checkout** (Phase 5)
8. **Delete Shopify code & update memory** (Phase 6)

## Open questions to confirm before starting
1. **Vinoshipper deep-link format**: Do you have an example URL format from Vinoshipper for pre-populating a cart? (e.g. `https://vinoshipper.com/shop/<producer>/cart?add=SKU1:2,SKU2:1`). If not, I'll need to look it up against your account.
2. **Merch checkout in this phase**: confirm "Coming soon / contact us" placeholder is OK (no Stripe), or do you want Stripe enabled now just for merch?
3. **Wine sync cadence**: hourly? daily? on-demand only?
