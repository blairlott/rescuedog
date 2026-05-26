## Scope

Ship Phase 1 Thompson Sampling bandit infrastructure AND the high-leverage UX wins as one bundle. Everything routes through the existing `optimization_opportunities` approval queue with the autonomous toggle already shipped.

## What gets built

### 1. Thompson Sampling bandit (landing-side)

**DB (migration):**
- `bandit_experiments` — id, name, surface (`landing_hero`, `pdp_cta`, `cart_upsell`, etc.), status (`draft`/`active`/`paused`), autonomous (bool), created_by
- `bandit_variants` — experiment_id, key, payload (jsonb: copy/image/cta/utm), alpha (default 1), beta (default 1), impressions, conversions
- `bandit_events` — experiment_id, variant_id, session_id, event (`impression`/`conversion`), revenue_cents, occurred_at
- RLS: read open for active experiments (impressions need to fire anon), writes via edge functions; admin/owner/ad_ops_manager manage experiments
- RPC `bandit_assign(experiment_name, session_id)` — Thompson sample (Beta draw per variant), record impression, return variant payload
- RPC `bandit_record_conversion(experiment_name, session_id, revenue_cents)` — increment alpha + log event
- Nightly RPC `bandit_scan_opportunities()` — for any experiment where one variant has ≥95% posterior win probability over control with min 200 impressions, insert an `optimization_opportunities` row (type `bandit_winner`) so it flows through the approval queue / autonomous toggle

**Edge fn `bandit-assign`** — public, validates experiment is `active`, calls RPC, returns variant payload. Cached per session via cookie/localStorage so the same visitor sees the same variant.

**Edge fn `bandit-convert`** — public, called on Vinoshipper handoff / Shopify checkout open. Idempotent per session.

**CMS surface** — extend `CmsOpportunitiesPage` with a new "Experiments" tab listing live bandits, per-variant impressions/conversions/posterior win %, pause/resume, and a "Promote winner" button (or auto-promote when autonomous is on for that experiment).

### 2. Cart progress meter
- In wine cart drawer, show "$X to shipping included" bar against the wine-shipping threshold (read from existing settings). Pure presentation, no checkout logic change.

### 3. Sticky mobile ATC bar
- Wine PDP only, mobile breakpoint, slides up after hero scrolls past. Shows price + Add to Cart. Reuses existing ATC handler.

### 4. LCP preload
- Inject `<link rel="preload" as="image" fetchpriority="high">` for the hero image on the homepage, wine shop landing, and merch landing. For dynamic Shopify/Supabase hero images, do it via `react-helmet-async` inside the route component using the resolved CDN URL.

### 5. Exit-intent + scroll-depth offer
- Reusable hook `useExitIntent` (mouseleave on desktop, 60% scroll on mobile, one-shot per session via sessionStorage).
- Modal on wine PDPs invites "Join The Pack" (access-based, no % off — per brand memory). Copy passes through brand guardrails.

### 6. PDP social proof
- Above the buy button on wine PDPs: show top review snippet + medal/award badges (already in `wine_products.tags`). Uses existing `AwardBadges` component, adds a lightweight review snippet block from existing review data (or hides cleanly if none).

### 7. JSON-LD on wine PDPs
- Add `Product` + `Offer` JSON-LD via `react-helmet-async` on the wine PDP route. Includes name, image, description, sku, brand, price, availability. Adds `AggregateRating` only when real review data exists — never fake.

## Wiring into approval queue

- The bandit's `bandit_scan_opportunities` RPC is the only autonomous writer here — winners land in `optimization_opportunities` and respect the existing global autonomous toggle plus a per-experiment autonomous flag.
- UX changes (#2–#7) ship as live code, not opportunities — they're floor-level best practices, not experiments. The bandit then runs experiments on top of them (e.g. cart-meter copy variants, exit-intent headline variants).

## Out of scope (deferred)

- Meta/Google ad-platform bandit (Phase 2 — needs OAuth tokens).
- Email lifecycle sequences.
- Funnel dashboard in CRM.
- Vault migration for plaintext secrets.

## Post-ship

- Append Changelog entry to `/mnt/documents/Lindy_User_Manual_and_Roadmap.docx` covering the new RPCs (`bandit_assign`, `bandit_record_conversion`, `bandit_scan_opportunities`) and edge functions (`bandit-assign`, `bandit-convert`).
- Schedule `bandit_scan_opportunities` daily via pg_cron (reuse existing cron secret pattern).
