---
name: Kennel Ad Optimization Stack
description: DoW bid modifiers, geo bid modifiers, seasonality budget curve, and 60-90 day retention-risk view feeding ad bid/budget rules
type: feature
---

CONSUMER-only (non-wine-club, non-cancelled) Vinoshipper orders are the canonical source for all ad-optimization signals. Wine club shipments are batch-processed Mondays and would otherwise inflate ROAS and DoW patterns.

Tables (all RLS readable by `can_view_kennel`; writes service-role only):
- `kennel_bid_modifiers` — per day-of-week multiplier, 90d window, clamped [0.5, 2.0], min 3 active days
- `kennel_geo_modifiers` — per state, lifetime LTV vs median, clamped [0.5, 2.0], min 25 customers, tiered A/B/C
- `kennel_seasonality_curve` — month-of-year revenue index vs avg month, clamped [0.3, 3.0]

View:
- `kennel_retention_risk_summary` — aggregated per state, customers whose last CONSUMER order was 60–90 days ago (median time-to-2nd-order = 77d). Feeds Meta Custom Audience and Mailchimp winback.

Recompute edge functions (auth via `KENNEL_INGEST_SECRET` header or service-role JWT):
- `kennel-recompute-bid-modifiers` — nightly 07:10 UTC
- `kennel-recompute-geo-modifiers` — nightly 07:15 UTC
- `kennel-recompute-seasonality` — nightly 07:20 UTC

UI: surfaced under "Ad optimization" section on `/kennel` dashboard (BidModifiersPanel, SeasonalityPanel, GeoModifiersPanel, RetentionRiskPanel). Each has a manual Recompute button.

Next step (not yet built): the Meta/Google ad sync jobs should read these tables and apply the modifiers as dayparting / state bid adjustments / monthly budget multipliers.