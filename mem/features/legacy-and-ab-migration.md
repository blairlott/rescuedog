---
name: Legacy site parity + A/B migration
description: All new features must ship on legacy site where feasible, with architecture designed for seamless migration to the new site. We A/B test both to prove the conversion/ROI thesis.
type: preference
---
**Rule:** When building any new feature, capability, or fix:

1. **Implement on legacy site as much as possible** — don't leave the legacy site behind. If a backend/edge function powers it, make sure legacy can consume it (REST/iframe/snippet).
2. **Design for seamless migration** — keep business logic in shared edge functions / RPCs / DB views, not duplicated per-site. Frontend code can fork, but the data + API layer should be one.
3. **Both sites run side-by-side for A/B testing** — we are proving the thesis that the new site improves conversions and ROI vs. the legacy site. Don't break the legacy variant.

**Why:** Blair directive 2026-05-24. Migration is not a hard cutover; it's a measured rollout gated by A/B results.

**How to apply:**
- Before shipping a new frontend-only feature, ask: can the legacy site reach the same backend? If not, expose an edge function or RPC.
- For new tables, design schema for both sites' consumption patterns from day one.
- Avoid Lovable-only client APIs when an HTTP equivalent works for both.
