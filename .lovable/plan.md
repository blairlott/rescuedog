
## Reality check vs the spec

Five things in the prompt don't match what's actually in the project. Confirm how you want each handled before I build:

1. **No Claude/Anthropic key in the project.** The standing rule is to default to Lovable AI Gateway (Gemini/GPT-5 family) — no extra key needed, billed through the workspace. I'll use `google/gemini-2.5-pro` for the scoring pass unless you say otherwise.
2. **`vs_transactions.cartType` doesn't exist.** The real column is `order_type`. Finance already excludes wine club/wholesale with `upper(order_type) NOT IN ('WINE_CLUB','WHOLESALE')` — I'll use that same rule.
3. **`vs_abandoned_carts` schema differs from the spec.** Real columns: `buyer_email` (not `email`), `ship_state` (not `state`), `cart_value` (not `order_total`), and **no `referrer_url`**. I'll map: email→`buyer_email`, state→`ship_state`, order_total→`cart_value`, and drop `referrer_url` (also not present on `vs_transactions`).
4. **No `google-ads-customer-match` route on `google-ads-proxy` yet.** The proxy exists but doesn't have a Customer Match upload route. I'll add it (Google Ads API v17 `OfflineUserDataJobService`, CRM userlist, SHA-256 hashed emails).
5. **"Z2 Meta upload"** = existing `meta-audience-sync` edge function. I'll wire the dashboard's "Upload to Meta Now" button to that.

Also flagging: scoring every abandoned cart through an LLM one-by-one is slow and expensive. I'll batch (200 emails per LLM call, parallelized) and cap the run at the most recent ~10k abandoned carts per pass. Tell me if you want a different cap.

## What I'll build

### 1. Edge function `kennel-lookalike-score`
- Pulls paid DTC buyers from `vs_transactions` (excluding WINE_CLUB and WHOLESALE) and computes per-email features: order count, total spend cents, days since first order, state tier weight (T1=1.2 / T2=1.0 / T3=0.8 using the existing Kennel tier list), bottles total.
- Pulls abandoned carts whose `buyer_email` isn't in the buyer set; same feature shape (counts default to 0, days_since_first_order = null).
- Sends batches of 200 prospects to Lovable AI with a summarized buyer profile (means + state distribution) and asks for `[{email, score}]` via tool calling (structured output, not freeform JSON).
- Upserts into `kennel_lookalike_scores(email, score, scored_at, model_version)`.
- Scheduled weekly Sun 03:00 ET (08:00 UTC standard / 07:00 UTC DST — I'll use `0 8 * * 0` and document the DST drift).

### 2. Edge function `kennel-google-customer-match`
- Pulls buyers + top 20% of `kennel_lookalike_scores`, SHA-256 hashes lowercased+trimmed emails, dedupes.
- Calls the new Customer Match route on `google-ads-proxy` (Bearer = existing `LINDY_PROXY_TOKEN` secret — I'll **not** hardcode the token from the prompt).
- Adds the Customer Match route directly to `google-ads-proxy` using existing Google Ads secrets (`GOOGLE_ADS_*`) — creates/updates a CRM userlist named `kennel_buyers_plus_lookalikes` and runs an `OfflineUserDataJob` of ADDs.
- Logs every run to `kennel_audience_uploads`. On failure, status='failed' + dispatches an alert via existing `kennel-alert-dispatch` to `blair.lott@rescuedogwines.com`.
- Scheduled monthly on the 1st at 09:30 ET.

### 3. `kennel_iab_segments` table + GET endpoint
- Table with the six seed rows from the spec.
- Admin-only writes via RLS (`is_admin_or_owner`). Public-readable through a small edge function `kennel-iab-segments` (GET) that returns the full mapping JSON so DSPs can fetch it without auth burden.

### 4. Admin panel page `/cms/audiences`
- Score distribution histogram (10 buckets), totals card (total scored, top-20% count, median, last scored).
- Audience upload log table (sortable by date).
- Editable IAB segment table (inline admin edits to `platform_ids` jsonb + `rdw_mapping`).
- Three quick-action buttons that invoke the corresponding edge functions and toast results.

### Guardrails baked in
- Never persist or upload raw emails — all platform calls hash first.
- `kennel_lookalike_scores` RLS: admin/exec/ad_ops read only, no public exposure.
- Every upload writes to `kennel_audience_uploads` *before* returning success.
- Failed uploads → status='failed' + alert email.

## Tables added
- `kennel_lookalike_scores` (email, score, scored_at, model_version)
- `kennel_audience_uploads` (platform, list_name, email_count, upload_at, status, error_message)
- `kennel_iab_segments` (segment_id, segment_name, tier, rdw_mapping, platform_ids)

## Edge functions added / changed
- **New:** `kennel-lookalike-score`, `kennel-google-customer-match`, `kennel-iab-segments`
- **Changed:** `google-ads-proxy` — adds `customer-match` route (CRM userlist + OfflineUserDataJob)
- **Reused:** `meta-audience-sync` (for the "Upload to Meta Now" button), `kennel-alert-dispatch` (for failure alerts)

## Cron
- `0 8 * * 0` → `kennel-lookalike-score` weekly
- `30 14 1 * *` → `kennel-google-customer-match` monthly (1st at 09:30 ET standard)

## Out of scope / open questions
1. **Confirm Lovable AI** for the scorer instead of Claude (recommended — no new keys, billed via workspace).
2. **Confirm batch cap** of 10k most-recent abandoned carts per weekly run.
3. The hardcoded bearer token in your prompt — I'll use the existing `LINDY_PROXY_TOKEN` secret instead of writing the literal into code. OK?
