# Hero Image Rules

Canonical reference for wine and merch hero image work. Future Lovable
sessions MUST read this before generating, replacing, or editing any
hero asset. This file overrides chat scrollback when the two disagree.

Last updated: 2026-05-29 (post Phase-1 hero rollback, post Session 4
sync-catalog semantic flip).

---

## 1. Hard non-negotiables (wine AND merch heroes)

- **Brand integrity is a hard line.** Heroes must feature ACTUAL RDW
  products (wine) or live Shopify products (merch). Never generic,
  never speculative, never "coming soon."
- **Labels and product designs must be ACCURATE.** AI-rendered labels
  often contain typos (`SAUVIGNONN`, `SUSTAINARLE`, duplicate
  `SUSTAINABLE` line). These are unacceptable as a steady state.
  Acceptable only as interim if no better tool is available AND the
  artifact is explicitly documented as "known artifact pending
  out-of-band fix."
- **Dimensions: 1920×1080 target (16:9).** Current rollback state is
  1536×1024 (hero 1) and 1600×900 (hero 2), declared in `<img>` as
  1920×1080. This causes CLS. Future hero updates should normalize to
  1920×1080 to fix Core Web Vitals.

---

## 2. Wine hero rules

- **Sales-data cadence.** Featured bottles should align with
  bestsellers. Source: aggregate `vs_transactions` by product, rank
  descending. Highest-visibility hero slots go to top sellers.
- **Glass wine color MUST match bottle varietal.** Red varietals →
  ruby; rosé → pink; white → pale yellow; sparkling rosé → pink with
  visible bubbles; sparkling demi-sec → pale gold with bubbles. A
  Cabernet bottle with white wine in the glasses breaks scene
  authenticity instantly.
- **People: predominantly age 28-35**, diverse representation
  (ethnicity, body type, gender presentation), candid relaxed body
  language. Some age variation acceptable for scene-appropriate
  context (kids in family scenes, parents in intergenerational
  dinners).
- **Photographic realism required.** Bottles must integrate with the
  scene's depth of field, lighting direction, cast shadow, and scale
  — bottle ≈ 2× wine-glass height, ≈ 1/3 seated-person height.
  Bottle PNG overlay without scale-matching is the failed approach;
  do not repeat.
- **Label corrections require non-diffusion tools.** Adobe Firefly
  Generative Fill, Photoshop content-aware edits, or a human
  designer. Lovable's `imagegen--edit_image` is diffusion-based and
  cannot do surgical character corrections without re-rendering and
  introducing new artifacts.

---

## 3. Merch hero rules (rescuedog.com domain)

- **Only feature products currently live and purchasable** in the
  Shopify store. Never feature speculative products, designs in
  development, or out-of-stock items.
- **Active-catalog query first.** Before generating any merch hero,
  list active products via Shopify Storefront API (or mirrored
  Supabase table). Match featured products to that list.
- **Sales-data prioritization where data exists** (bestselling
  products in highest-visibility slots). Early launch with no sales
  data: Blair selects manually from active catalog.
- **Scale down gracefully.** If active catalog only supports 2 hero
  variants, ship 2. Do not pad rotation with speculative products.
  Optional fallback: a "mission moment" hero featuring no specific
  product (the 50%-to-rescue mission is itself brand-authentic).
- **Inventory-linked retirability.** Hero variants featuring sold-out
  or discontinued products should be retirable via a status flag, not
  via deletion. We're not building that automation today, but don't
  bake assumptions that block it.

---

## 4. Iteration-ready architecture

- Each hero variant carries a `traits` metadata object: varietal /
  featured_product, scene_type, time_of_day, group_size, has_dog,
  lighting, light_direction. This metadata lets conversion data be
  correlated to specific design choices in future bandit
  experiments.
- **Variant IDs should be self-describing** where practical (e.g.
  `img1-cabernet-vineyard-cheers`) so analytics dashboards can group
  by lever without JOINs.
- **Adding a new variant should be a one-line edit, not a refactor.**
  Keep the `WINE_HERO_IMAGES` / merch equivalent array easily
  extensible.

---

## 5. Bandit + conversion attribution (existing infrastructure)

- `experiment_assign` RPC (fixed 2026-05-29) selects which hero
  variant to show each visitor.
- `ab_checkout_intents` table captures the conversion path with
  `ga4_client_id` and `gclid` when present.
- `variant_id` linkage is already in place — no new infrastructure
  needed to measure hero performance.

---

## 6. Evolution toward dynamic hero system

These rules are interim. The static-asset approach will be replaced
by a database-backed dynamic hero system (target: this weekend's
work). In that system:

- `hero_image_variants` table with FK to products.
- DB constraints enforce "no inactive products in active heroes."
- Generation pipeline (manual upload first, AI-generated later).
- Auto-retirement when products go inactive or performance drops
  below threshold.

When the dynamic system ships, this file must be updated to reflect
that the rules are now database-enforced rather than
documentation-enforced.