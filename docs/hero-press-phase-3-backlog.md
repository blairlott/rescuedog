# Hero & Press — Phase 3 Backlog

Status: planned. Do not begin without explicit go from operator.

## 3.0 — Hero order attribution (FIRST item, blocks bandit calibration)

Today the homepage hero bandit (`hero_variants` + `hero_events` +
`get_hero_variant_stats`) optimizes on impressions + clicks only. Order
conversion is not attributed back to the variant that drove the click,
so revenue/orders columns in `get_hero_variant_stats` are zero and the
Thompson sampler optimizes against an imperfect proxy.

Deliverables:
- `hero-order-attribution` edge function (Vinoshipper webhook receiver)
- Vinoshipper webhook subscription for order.created / order.completed
- Propagate `hero_variant_id` outbound via `?hv=<variant_id>` URL param
  on cart links to Vinoshipper, AND via the existing `rdw_hero_variant`
  cookie (belt + suspenders — webhook reads whichever it can resolve)
- Insert `event_type='order'` rows into `hero_events` with `order_value`
  (cents) and `variant_id`
- Update `get_hero_variant_stats` so `orders` / `revenue` columns read
  from `event_type='order'` rows
- Backfill: best-effort match historical Vinoshipper orders to recent
  variant impressions by session/cookie where data exists

Acceptance:
- A test order placed via Vinoshipper after a hero click increments the
  `orders` and `revenue` columns for the correct variant within 5 min
- Bandit weight shifts measurably toward higher-revenue variants over a
  2-week observation window

## 3.1 — Autonomous press scout

Weekly cron + candidates queue. When a new press mention is discovered,
attempt logo fetch via priority chain: Brandfetch → Wikipedia/Wikimedia
→ outlet press kit → site header (paused if all fail). Surface to
brand_owner approval queue with sourced logo attached. Manual override
available.

## 3.2 — Autonomous pull quote extraction

Extract candidate pull quotes from article bodies. Operator approves
before publish (per CONTENT_RULES §10).

## 3.3 — Rescue partner testimonials

Lindy email mining → admin approval queue → homepage section.

## 3.4 — `/press` public section page

Full press archive page, linked from PressStrip.

## 3.5 — Hero Variants admin UI + performance dashboard

Per-variant pause/retire controls, weight overrides, impression/click/
order/revenue dashboards. Required so Blair can manually intervene on a
badly-performing variant during a launch window or seasonal moment.

## 3.6 — Rigorous per-quote A/B testing

Per-quote conversion attribution within the PressStrip surface.