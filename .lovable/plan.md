# Autonomous Keyword Engine — Google Ads & Instacart

A semi-auto keyword generation + optimization layer wired into the existing Channels drill-down at `/kennel/channels`. Same `is_ad_ops` permission model, same Execution Log audit trail.

## What it does

For any selected ad group (Google or Instacart), the engine can:

1. **Generate keyword ideas** from 4 sources, blended + deduped:
   - Lovable AI (Gemini) — brand-aware seeds from `wine_products` + mission copy
   - Google Ads Keyword Plan Idea Service — real volume/competition/CPC
   - Semrush keyword research — volume, difficulty, related/question terms
   - Search-term reports from the campaign itself — what already triggered ads
2. **Score & classify** each idea: high-intent / low-intent / negative-candidate
3. **Auto-execute** the safe actions, queue the risky ones for approval:
   - Auto: add high-intent keywords, add negatives for zero-conversion search terms, lower bids on losers, pause keywords past spend threshold with zero conversions
   - Gated: bid raises above +25%, keywords with monthly volume > 50k, broad-match additions
4. **Run nightly** via cron, plus on-demand "Run engine" button in the drill-down

## UI changes

Inside the ad-group level of Channels drill-down (Google + Instacart), add a **Keyword Engine** panel:

- "Run engine" button → calls edge function, shows live progress
- Tabs: **Ideas** (pending) · **Applied** (executed) · **Pending approval** (gated) · **Negatives**
- Each row: keyword, source badge, est. volume, est. CPC, score, recommended action, approve/reject buttons
- Settings drawer: spend threshold for pause, bid-raise % gate, daily idea cap

## Backend

### New table: `kennel_keyword_ideas`
| col | type | notes |
|---|---|---|
| id | uuid | pk |
| platform | text | google / instacart |
| campaign_id | text | |
| ad_group_id | text | |
| keyword | text | |
| match_type | text | exact / phrase / broad |
| source | text | ai / google_plan / semrush / search_term |
| score | int | 0–100 |
| recommended_action | text | add / negative / raise_bid / lower_bid / pause |
| recommended_bid_micros | bigint | nullable |
| volume | int | nullable |
| cpc_micros | bigint | nullable |
| status | text | pending / applied / rejected / awaiting_approval |
| reasoning | text | short AI/heuristic explanation |
| executed_resource_name | text | platform-side ID after apply |
| created_at / updated_at / reviewed_by | |

RLS: `is_ad_ops` only.

### New table: `kennel_keyword_settings` (one row per advertiser)
- pause_threshold_cents (default 2000)
- pause_zero_conv_days (default 14)
- bid_raise_gate_pct (default 25)
- max_daily_adds (default 20)
- engine_enabled (bool)

### New edge function: `kennel-keyword-engine`
Actions:
- `generate` — pulls from 4 sources, scores, inserts ideas
- `apply` — executes a single idea (or batch); auto vs gated based on settings
- `list` — returns ideas for an ad group, grouped by status
- `update_settings`

Calls existing `kennel-meta-browse` patterns for Google Ads (`adGroupCriterion:mutate`) and the Instacart v3 endpoints for keyword targeting. Logs every apply to `ad_execution_log`.

### Nightly cron
`pg_cron` job at 03:00 UTC → POSTs to `kennel-keyword-engine` with `action=run_all` per advertiser. Skips ad groups where `engine_enabled = false`.

## Scoring heuristic (deterministic, on top of AI suggestions)

```
score = 0
+ 40 if source = search_term AND conversions > 0
+ 30 if volume between 100 and 10k
+ 20 if cpc <= ad_group_default_bid * 1.2
+ 10 if keyword contains a brand/varietal token from wine_products
- 30 if competition = HIGH AND no prior conversions
```

`score >= 70` → auto-add. `40–69` → awaiting_approval. `< 40` → discard. Search terms with spend ≥ threshold and zero conversions → negative candidate.

## Out of scope (v1)

- Bid-raises that pass the gate auto-apply once approved (no further escalation)
- Match-type optimization on existing keywords
- Cross-campaign portfolio bidding
- Conversion-import wiring (uses what's already in Google Ads / Instacart)

## Files I'll touch

- **New migration**: `kennel_keyword_ideas`, `kennel_keyword_settings`, RLS
- **New edge function**: `supabase/functions/kennel-keyword-engine/index.ts`
- **New component**: `src/components/kennel/KeywordEnginePanel.tsx`
- **Edit**: `src/pages/kennel/KennelChannelsPage.tsx` — mount panel at ad-group level
- **New cron**: pg_cron job via `insert` tool (not migration — contains URL/key)

## Confirm before I build

This is ~1 large pass. Want me to proceed end-to-end, or build it in two ships: (1) generation + UI + manual apply first, then (2) auto-execution + nightly cron once you've eyeballed the suggestions?