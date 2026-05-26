# Bayesian Bandit Audit + Catalog/Hint Optimization

## What's already running (audit findings)

**Live Thompson Sampling surfaces**
- `MerchHero` and `WineHero` — Beta posteriors on `clicks + 8×orders` per variant; 200-impression exploration floor, then TS picks.
- `useExperiment(slotKey, defaultConfig)` hook → `experiment_assign` RPC. Any wrapped slot is bandit-assigned, sticky per visitor, with exposure/conversion/revenue events recorded.
- `experiments-autopilot` + `site-autopilot-nightly` — promote winners (≥200 exposures/variant, ≥10% lift) into `personalization_rules`.
- `optimization-scanner` — sticky/retire hero variants, tune shipping-included threshold from order distribution.
- `site-intel` — click, scroll, attention, rage tracking feeding decisions.

**What is NOT yet bandit-optimized (the gap)**
- Wine catalog order on `/shop` (currently a strict hand-curated sort per `mem://features/wine-sort-order` — see constraint below).
- Merch grid order on `/merch`.
- `PersonalizedRecommendations` uses a static keyword score, no bandit, no learning.
- Cart upsell / cross-sell picks (`MerchForWineLoversStrip`, `PairWineWithMerch`, `BundleStrip`, `PairItPicker`) — static rules, no posterior.
- PDP "purchase hints" (related products, pairing chips, "frequently bought with").
- Post-purchase upsell + exit-intent offer — static.
- Reward weighting: hero bandit uses `clicks + 8×orders` but ignores AOV, margin, and time-decay. No per-segment posteriors (device, geo, member vs guest, new vs returning).

## Constraint to resolve first

`mem://features/wine-sort-order` mandates a strict wine sort sequence. **Bandit re-sorting of the wine grid would violate this** unless we get explicit approval to relax it (or scope the bandit to a "Recommended for you" rail above the curated grid). Open question for you below.

## Proposed work

### Phase 1 — Tighten the existing bandit (1 day)
1. Add **per-segment posteriors** to `experiment_assign` (device × authState × geoIsUS) so cohorts learn independently. Already have segment in the hook; missing on the RPC side.
2. Switch reward from `clicks + 8×orders` to **revenue-per-impression with a Gamma-Poisson prior** for AOV-sensitive surfaces (hero, cart upsell). Keep CTR-Beta for top-funnel surfaces.
3. Add **time-decay** (half-life ~14 days) so seasonal winners don't lock in forever.
4. Lower the exploration floor to 150 for low-traffic slots; raise to 400 for hero where stakes are high.

### Phase 2 — Bandit-driven cross-sell / purchase hints (2–3 days)
New slot keys wrapped with `useExperiment`, no UI rewrite needed:
- `cart_upsell_product` — bandit picks 1 of N candidate SKUs given cart contents; reward = added-to-cart + 8×purchased.
- `pdp_pairing_pick` — bandit picks pairing chip / "goes well with" SKU per PDP; reward = click + 4×add.
- `post_purchase_upsell_sku` — bandit picks the upsell SKU on `/thank-you`; reward = upsell purchase.
- `personalized_rec_strategy` — bandit between {keyword-match, co-purchase, popularity, segment-popularity} strategies feeding `PersonalizedRecommendations`. Static scorer becomes one arm of many.

Each gets a candidate-set seeder (admin UI in `/kennel/bandit`) + auto-creation in `experiments` table.

### Phase 3 — Catalog-sort bandit ("Smart Sort") (3–4 days, gated on constraint decision)
Two options depending on your call:

**Option A — "Recommended" rail above curated grid (safe, no constraint conflict)**
- Insert a 4-tile "Recommended for you" strip at the top of `/shop` and `/merch`. Bandit picks the 4 SKUs per visitor segment from a candidate pool. Curated sort below stays untouched.

**Option B — Full Smart Sort toggle (requires relaxing wine-sort-order memory)**
- Add a sort dropdown: `Curated` (default, current) | `Smart` (bandit). Smart Sort scores every SKU as `posterior_mean(reward | segment) × stock_available × margin_weight` and orders descending. Logs an impression for the top 24, conversion on add-to-cart. Curated stays the canonical default; Smart is opt-in until it proves out.

### Phase 4 — Reporting (0.5 day)
Extend `/kennel/bandit` with: per-slot posterior table, P(best), expected lift over control, segment breakdown, and a "promote winner to personalization rule" button (already exists for hero — generalize).

## Schema additions (minimal)

```sql
-- per-segment posteriors so cohorts don't blend
ALTER TABLE public.experiment_events ADD COLUMN segment_bucket text;

-- candidate pools for slots that pick SKUs (not just copy variants)
CREATE TABLE public.experiment_candidates (
  id uuid PK, experiment_id uuid FK, candidate_ref text, candidate_type text,
  weight numeric DEFAULT 1, status text DEFAULT 'active', ...
);
```

## What I need from you before building

1. **Wine sort constraint** — Option A (safe rail), Option B (Smart Sort toggle), or both?
2. **Reward weighting** — keep `clicks + 8×orders` everywhere, or move hero/cart to revenue-per-impression (recommended)?
3. **Scope of phase 1** — do all four tweaks, or just the high-value ones (per-segment + revenue reward)?

Once you answer, I'll scope the migration + edge function work and start with Phase 1.
