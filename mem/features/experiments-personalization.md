---
name: Experiments & Personalization
description: Self-optimizing system — Thompson-sampling bandit + segment-based personalization rules, controlled from /cms/experiments
type: feature
---
**System:** Three layers running together.
1. **Personalization rules** (`personalization_rules` table) — deterministic segment-match (authState/device/geo/referrer/utm). Highest priority. Editable at `/cms/experiments` → Rules tab.
2. **Experiments** (`experiments` + `experiment_variants` + `experiment_assignments` + `experiment_events`) — Thompson-sampling bandit via `experiment_assign` RPC. Sticky per visitor (cookie `rdw_visitor_id`).
3. **Default config** — passed by caller as fallback.

**Resolution order:** rule → experiment → default.

**Primary metric:** revenue-per-visitor. `ThankYouPage` calls `recordExperimentRevenueForVisitor()` once per order (dedupe via `sessionStorage`), which writes a `revenue` event against every running experiment the visitor was exposed to.

**Hook:** `useExperiment<T>(slotKey, defaultConfig)` returns `{ config, recordConversion, recordRevenue, source, variantKey }`. Exposure auto-recorded on mount.

**Wired slots in v1:**
- `homepage_hero` — image, headline, subtitle, CTA label, CTA href (Index.tsx)
- `homepage_ambassador_strip` — strip visibility on homepage (Index.tsx, declared but not rendered yet)

**Catalog (declared in `SLOT_CATALOG` in CmsExperimentsPage):** homepage_hero, homepage_ambassador_strip, homepage_blocks_order, cart_promo_banner, club_featured_tier, ambassador_placement, pdp_layout. Editors create experiments/rules against these keys; new keys appear automatically when wired via `useExperiment(...)` in code.

**Files:**
- DB: experiments, experiment_variants, experiment_assignments, experiment_events, personalization_rules; RPCs `experiment_assign`, `experiment_record`
- Client: `src/hooks/useExperiment.ts`, `src/hooks/usePersonalization.ts`, `src/hooks/usePersonalizationRules.ts`, `src/lib/visitorId.ts`, `src/lib/experimentRevenue.ts`
- Admin: `/cms/experiments` (`src/pages/CmsExperimentsPage.tsx`) — CMS-editor only

**Statistical note:** ~50 exposures per variant minimum before signal is meaningful. At ~920/mo organic traffic, expect 2–3 concurrent experiments max.