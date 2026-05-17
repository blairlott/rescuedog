# Executive Intelligence Platform — confirmation + build plan

## Yes — that is exactly what we're building

The thesis you just stated is the spine of the whole system:

> **The app should let executives act on intelligence beyond what any human could surface in a working week — automatically synthesized, prioritized, and one click from action.**

Concretely that means three layers, every one of which is half-built already:

1. **Sense** — pull every signal that matters (ads, sales, club, dropship, web, CRM, experiments, support) into one dimensional store.
2. **Think** — run statistical + AI models continuously: forecasts, saturation curves, anomaly detection, attribution, churn, margin, propensity.
3. **Act** — surface a ranked "today's decisions" queue with one-tap approve/execute (pause, rebalance, fund, refresh creative, trigger campaign). Everything logged.

Last turn we shipped the schema spine (`ad_performance_facts`, `ad_forecasts`, `ad_saturation_curves`, `ad_anomalies`, `audience_propensity_scores`) and the `ad-intelligence` engine. This plan finishes the loop.

---

## What we'll build

### 1. Dimensional ingest (fills `ad_performance_facts`)

One edge function per platform, each pulling the deepest report the API allows, written to the shared facts table.

| Function | Source | Dimensions pulled |
|---|---|---|
| `kennel-ingest-google` | Google Ads `customer.search` + reports | campaign, ad_group, ad, keyword, audience, device, network, geo (region+DMA), hour |
| `kennel-ingest-meta` | Meta Insights API | campaign, adset, ad, creative, age/gender/audience, placement, device, region/DMA, hour, attribution_window |
| `kennel-ingest-instacart` | Instacart Ads reporting (all 7 ad formats) | campaign, ad_group (where applicable), product/creative, placement, region, daypart |

All three follow the same pattern → one shared `_shared/facts-writer.ts` helper.

### 2. Cross-system business signals (new tables, all RLS-gated to executives/ad-ops)

Pulled from data already in the project — no new external APIs required:

- **Revenue & margin** — joins `vs_transactions`, `orders`, `dropship_orders`, `wine_club_shipments` → daily `business_revenue_facts` (channel, sku, customer_segment, state, margin_cents).
- **Customer cohorts** — built from `profiles` + `vs_transactions` + `wine_club_memberships` → cohort retention curves, LTV, churn flag.
- **Sales pipeline velocity** — `sales_accounts` + `sales_activities` → stage conversion, rep-level forecasts, stale-account risk.
- **Web demand signal** — `locator_searches`, `experiments` exposures, `leads` → top-of-funnel intent vs. paid spend (over/under-served zips).
- **Wine club health** — `wine_club_memberships` + `wine_club_shipments` + `wine_club_weather_holds` → churn risk, skip rate, weather-loss exposure.
- **Compliance/risk** — `impact_health_checks`, blocked states, age-gate failures.

### 3. Predictive engines (extend `ad-intelligence` → `intelligence`)

The existing function stays; we add actions that don't exist anywhere yet:

| Action | What it does |
|---|---|
| `attribution_mta` | Multi-touch attribution joining ads → web → orders. Last-touch, position-based, and time-decay. Writes `attribution_paths`. |
| `forecast_business` | Blended revenue/cost forecast across ads + club + dropship, with pace-to-monthly-goal. |
| `churn_predict` | Per-customer churn probability from RFM + club skip behavior + support signal. |
| `margin_optimize` | Recommends product mix shifts using contribution margin × demand elasticity. |
| `geo_demand_gap` | Compares Vinoshipper destinations + locator searches to current ad geo to surface "demand without spend" and "spend without demand". |
| `creative_fatigue` | Predicts day each ad crosses target-ROAS floor; queues refresh recommendation. |
| `executive_brief` | Lovable AI rolls everything above into a daily 5-bullet brief with linked one-click actions. |

### 4. Action queue + autopilot

- New table `executive_decisions` (priority, scope, impact_dollars, recommended_action, payload, status, approver, executed_at).
- All engines write into it instead of (or alongside) their channel-specific tables.
- A nightly `intelligence-autopilot` cron runs ingests → engines → writes the decision queue → emails the morning brief via Resend.
- Auto-execute toggle per decision type (e.g. auto-pause zero-ROAS ads under $100/day, but require approval for >$500 budget shifts) — same guardrail pattern we already use in `ad_guardrails`.

### 5. Executive Command Center UI (`/intelligence`)

One screen, four panels:

1. **Today's decisions** — ranked card list with Approve / Snooze / Reject and $ impact.
2. **Pace to plan** — month-to-date revenue, spend, blended ROAS, club retention vs target with forecast cone.
3. **Anomalies & risks** — open critical/warn flags across ads, club, sales, compliance.
4. **Where to lean in / pull back** — saturation table (ads) + demand-gap map (geo) + margin shifts (mix).

A second route `/intelligence/explore` keeps the Trade Desk-style drill-down for power users (any dimension × any metric × any date range).

---

## Technical details

```text
┌─────────── INGEST (nightly + on-demand) ───────────┐
│ kennel-ingest-google ─┐                            │
│ kennel-ingest-meta   ─┼──► ad_performance_facts    │
│ kennel-ingest-instacart─┘                          │
│ business-rollup ──────────► business_revenue_facts │
│ cohort-builder ───────────► customer_cohorts       │
└────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────── INTELLIGENCE ENGINE ────────────────┐
│ forecast · saturation · anomalies · MTA            │
│ churn · margin · geo_gap · creative_fatigue        │
│ executive_brief (AI narrative)                     │
└────────────────────────────────────────────────────┘
                     │
                     ▼
┌────────────── ACTION QUEUE + AUTOPILOT ────────────┐
│ executive_decisions (RLS = exec/ad_ops only)       │
│ intelligence-autopilot cron (pg_cron + pg_net)     │
│ guardrails decide auto-execute vs require-approval │
└────────────────────────────────────────────────────┘
                     │
                     ▼
       /intelligence  ←  Executive Command Center
       /intelligence/explore  ←  drill-down
```

- New role `executive` added to `app_role` enum (or reuse `owner`/`admin`). All exec tables RLS-gated with a new `is_executive(_user_id)` security-definer function.
- All new tables follow existing pattern: `id uuid`, `created_at`, `updated_at` trigger, indexed by `(date desc)` and natural scope keys.
- Models stay in-DB SQL + Lovable AI narrative (the hybrid you picked). No external ML service, no new secrets.
- Existing secrets cover everything: Google Ads, Meta Ads, Instacart Ads, Vinoshipper, Shopify, Resend, Lovable AI.
- Cron uses `pg_cron` + `pg_net` (already enabled for other jobs).

---

## Build order (proposed — confirm before I start)

1. Ingest functions (Google, Meta, Instacart) → fills facts table on a 6-hourly cron.
2. Business rollups (`business_revenue_facts`, `customer_cohorts`, churn signal).
3. New intelligence actions (attribution, business forecast, churn, margin, geo gap).
4. `executive_decisions` table + autopilot cron + morning email brief.
5. `/intelligence` Command Center + `/intelligence/explore` drill-down.

Approve this and I'll start at step 1.
