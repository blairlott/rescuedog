## Instagram Auto-Boost + A/B Test System

Build a 3-function pipeline inside Kennel that monitors organic Instagram performance, auto-boosts breakout posts as A/B tests (Purchase vs Wine Club Subscribe), and kills/wins them based on hard performance rules.

### Database (one migration)

Three new tables in Lovable Cloud:

- **`ig_post_metrics`** — rolling snapshot of every recent IG post (impressions, reach, likes, comments, shares, saves, derived `engagement_rate` and `save_rate`, `polled_at`).
- **`ig_boost_log`** — one row per (post, variant). Tracks `test_variant` (`'conversion'` | `'wine_club'`), Meta `campaign_id` / `adset_id` / `ad_id`, `daily_budget_cents`, `status` (`active|paused|killed|winner`), `kill_reason`, spend, purchases, subscribes, `cost_per_result`, `roas`.
- **`ig_boost_config`** — single-row tuning knobs (thresholds, kill rules, max active boosts, winner thresholds, `default_objective`). Seeded with the defaults you specified.

RLS: ad_ops / admin / owner read+write; service role full access (cron + edge functions use service role).

### Edge Function 1 — `ig-engagement-monitor` (every 6h)

1. Pulls media + insights for IG_USER_ID `1689217927783203` via Graph API v19.0.
2. Computes `save_rate` and `engagement_rate`, upserts into `ig_post_metrics`.
3. Qualifies a post when: `save_rate ≥ 0.03 OR engagement_rate ≥ 0.06`, `reach ≥ 500`, age ≥ 24h, not already in `ig_boost_log`, and fewer than `max_active_boosts` (3) currently active.
4. Invokes `ig-auto-boost` per qualifying post.

### Edge Function 2 — `ig-auto-boost`

For one post, creates in Meta Ads (account `act_23490172`):

1. Campaign `IGBoost_{post_id}_{YYYY-MM-DD}` — objective `OUTCOME_SALES`.
2. **Adset A — Purchase**: optimize `OFFSITE_CONVERSIONS` / `custom_event_type: PURCHASE`, $25/day, US targeting with 9 excluded regions (wine-shipping-blocked states by Meta region key), three custom audiences (`6937215635059`, `6937215772659`, `52507005005463`), Advantage+ audience on.
3. **Adset B — Wine Club**: identical except `custom_event_type: SUBSCRIBE`.
4. One Ad per adset using `object_story_id: 1689217927783203_{post_id}`.
5. Writes 2 rows to `ig_boost_log` (`conversion` + `wine_club`) both status `active`.

### Edge Function 3 — `ig-boost-monitor` (every 2h)

For every `status='active'` row:

1. Pulls lifetime insights for the `ad_id` (spend, purchases, subscribes, frequency).
2. Updates the log row with latest spend/results/ROAS/CPL.
3. **Kill rules** (PAUSE the ad on Meta, set status `killed` with `kill_reason`):
   - conversion variant: spend ≥ $30 and 0 purchases → `zero_purchases`
   - wine_club variant: spend ≥ $30 and 0 subscribes → `zero_subscribes`
   - any: frequency ≥ 3.5 → `frequency_cap`
4. **Winner logic** after 7 days OR $50 spend per variant:
   - Conversion wins if `ROAS ≥ 2.5`.
   - Wine Club wins if `CPL < $25` AND `400/CPL > 16` (static LTV $400).
   - If both meet thresholds: keep both, mark `status='winner'`, send Kennel SMS alert to Blair via existing alert channel.
   - Update `ig_boost_config.default_objective` with winning variant.

### Cron

Two `pg_cron` jobs scheduled via the insert tool (not migration — they contain project URL + key):

- `ig-engagement-monitor` → `0 */6 * * *`
- `ig-boost-monitor` → `0 */2 * * *`

### Guardrails (enforced in code)

- Max 3 simultaneous active boosts (checked in monitor before triggering boost).
- $25/day per variant, $50/day per post.
- Posts must be ≥ 24h old.
- Same `post_id` never boosted twice (unique check in `ig_boost_log`).
- Kill at $30 + 0 results, or frequency ≥ 3.5.
- Winner declared at 7 days or $50/variant spend.
- Winning objective auto-saved to config.

### Open items before I build

1. **Audience swap on June 1**: I'll hardcode `6937215635059` now and leave a clear `TODO(2026-06-01)` comment in `ig-auto-boost` next to the audience array. Or want me to put the ID in `ig_boost_config` as `purchase_audience_id` so you can flip it without a redeploy? (Recommended.)
2. **SMS alert to Blair on winner**: I'll reuse the existing Kennel alert path (`kennel-alert-health` style) — does that go to your phone today, or should I wire a new Resend email instead?
3. **No Kennel UI panel in this build** — just the backend + tables. I'll add a simple `/kennel/ig-boost` viewer in a follow-up if you want it.

### What I will NOT do without confirmation

- Run the migration (waiting for your yes).
- Create the cron jobs (those run after the functions deploy and you say go).
- Spend any actual Meta ad dollars — first run will create real campaigns the moment cron fires, so I'll suggest seeding cron in a paused state and you flip it on after a dry-run review.

Reply **yes** to proceed (and answer items 1–2 above), or tell me what to change.