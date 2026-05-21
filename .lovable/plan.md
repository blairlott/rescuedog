## Z8 Nightly Optimizer — Auto-Kill + Auto-Scale Build Plan

### Scope summary
Z8 does not exist in the codebase today. The existing **meta-autopilot** function executes pre-approved recommendations from `ad_recommendations` (a queue produced elsewhere). Z8 is a separate nightly **ad-level** decision engine that runs at 04:00 ET, makes its own kill/scale calls directly against the Meta Marketing API, and logs to `ad_execution_log` with `actor='z8_auto'`.

### What I'll build

1. **New edge function `z8-nightly-optimizer`** (`supabase/functions/z8-nightly-optimizer/index.ts`)
   - Cron-callable via `x-cron-secret = KENNEL_INGEST_SECRET`, plus admin/ad-ops manual trigger.
   - Pulls 14-day ad-level + adset-level insights from Meta Graph API v19.0 (`META_ADS_ACCOUNT_ID`, `META_ADS_ACCESS_TOKEN`).
   - Fields: `ad_id, ad_name, adset_id, adset_name, status, daily_budget, spend, frequency, actions{omni_purchase, add_to_cart, initiate_checkout}, created_time`.
   - Evaluates the 5 rule families in order: kill switch check → checkout-dropoff flag → kill → rotate → scale → retargeting freq kill.
   - Posts to Meta (`POST /v19.0/{id}` with `status` or `daily_budget`) and logs every action.
   - Sends SMS via existing `kennel-alert-dispatch`.

2. **Rule logic (exact thresholds from the prompt)**
   - **Kill**: spend ≥ $25, omni_purchase = 0, ad age ≥ 48h, name does NOT start with `WC-`. Cap: 5 per night (highest spend first).
   - **Checkout drop-off** (evaluated *before* kill, supersedes it): `add_to_cart ≥ 10 AND initiate_checkout ≥ 2 AND purchases = 0` → log `checkout_dropoff_suspected`, **no kill, no rotate**, dedicated SMS.
   - **Retargeting kill**: spend ≥ $25 AND frequency ≥ 3.0 AND purchases = 0, only for adsets tagged retargeting (via `adset_name` regex `/RTG|retarget|RMK/i` — confirm pattern).
   - **Scale**: purchases ≥ 2 AND ROAS ≥ 3.0x AND current daily_budget < $150 → +20%, capped at $150 cents per adset, max 1 per 48h, max 3 per night.
   - **Rotate**: after a kill, look up `ad_reserves` table for next paused reserve in same adset → activate.
   - **Auto-rollback**: at start of each run, check scale actions from last 48h; if ROAS dropped >30% vs baseline at-time, revert budget.

3. **New tables** (migration)
   - `ad_reserves(adset_id, ad_id, rotation_order, status)` — for creative rotation lookup.
   - `z8_kill_switch(enabled boolean, paused_at, resumed_at)` — Blair's "pause" / "resume" SMS reply target. Single-row config.
   - Extend `ad_execution_log` only if missing columns: `actor`, `action_type`, `reason`, `roas_at_time`, `spend_at_time` — I'll check and ALTER if needed.

4. **Cron job** (pg_cron, scheduled via `insert` tool since it contains the project ref + key)
   - `0 8 * * *` UTC = 04:00 EDT (note: ET drifts; user said "4am ET" — I'll use 09:00 UTC for EST and document).

5. **Vinoshipper handoff check (one-time, EV26-D)**
   - Script run inline: fetch the EV26-D ad's landing URL via Meta API, follow redirects, verify it reaches `vinoshipper.com` and renders on mobile-UA. Report finding in run output and SMS Blair if broken.

### Open questions (need confirmation before I build)

1. **Reserve ad source of truth**: The prompt mentions `ad_reserves` — that table doesn't exist. Do you want me to:
   (a) create an empty `ad_reserves` table you'll populate manually,
   (b) auto-detect reserves as paused ads in the same adset (no table needed), or
   (c) use a naming convention (e.g. `-R1`, `-R2` suffix)?

2. **Retargeting adset identification**: How is a retargeting adset identified today? Naming convention (`RTG-`, `RMK-`), Meta `targeting_type`, or a tag in the campaign metadata?

3. **SMS pause/resume inbound**: `kennel-alert-dispatch` sends outbound. There's no inbound SMS webhook today. Should I:
   (a) skip the inbound reply mechanism for now and just expose a `/kennel/z8` toggle in the admin UI for the kill switch, or
   (b) build a Twilio inbound webhook that parses "pause"/"resume" replies?

4. **Auto-rollback baseline**: To detect "ROAS dropped >30% within 48h of scale," I need a baseline ROAS snapshot at scale time. I'll store `roas_at_time` on the scale log and compare against current trailing-2-day ROAS for that adset. Confirm OK.

5. **Cron schedule**: "4am ET" — should I use 09:00 UTC year-round (EST winter, off-by-1h in EDT summer), or wire DST-aware scheduling via two cron entries?

6. **Meta API version**: prompt says v19.0; current ingest functions use v20.0+. Stick with v19.0 as specified, or use whatever the rest of the codebase uses?

### What I will NOT build (per "approval required" list)
- No budget increase above $150/adset
- No cross-campaign reallocation
- No adset-level pause (only ad-level)
- No new campaign/adset launch
- No bid-strategy changes
These will remain manual / require Blair "execute [N]".

### Files I'll create / modify
- `supabase/functions/z8-nightly-optimizer/index.ts` (new, ~500 lines)
- `supabase/functions/_shared/meta-graph.ts` (small helper if not already shared)
- `supabase/migrations/<timestamp>_z8.sql` (new tables + log columns)
- pg_cron entry (via insert tool)
- `src/pages/kennel/KennelZ8Page.tsx` (small admin UI: kill-switch toggle, recent run log, manual "run now" button) — only if you want UI; otherwise skip.

**Please answer the 6 open questions (or say "your call on all") and I'll build.**