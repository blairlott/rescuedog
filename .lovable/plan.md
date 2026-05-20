# Ad Platform Command Center — build plan

## Reality check on Instacart first (important)

The public **Carrot Ads API** (`docs.instacart.com/ads`) is a **publisher** API — it lets *retailers* render sponsored products / display / brand pages on their sites. It is **not** a brand-side campaign-management API.

Brand-side campaign management on Instacart is done either:
1. In **Instacart Ads Manager** (UI), or
2. Via the **Instacart API Partner Program** — gated, requires application + approval; partners like Pacvue, Skai, Perpetua, CommerceIQ get full CRUD on campaigns/ad groups/keywords/bids/budgets/reports.

**What this means for us:** until we are accepted as an API Partner (we should apply via our Instacart rep), we cannot programmatically create/edit Instacart campaigns. We **can**:
- Ingest **performance reports** (via partner API once approved, or scheduled CSV export from Ads Manager in the meantime)
- Surface **keyword/bid recommendations** in our dashboard
- One-click **deep-link** into Ads Manager to apply changes
- Once approved, flip the same UI to push edits live

The plan below builds it that way — UI + recommendation engine first, write-paths gated behind a "partner_api_enabled" flag.

---

## What we're building

### 1. Instacart Ads Command Center — `/kennel/instacart-ads`
A dedicated dashboard, plus a summary tile on the Kennel dashboard.

Sections:
- **Account health** — spend pace, ROAS, CTR, CVR, share of voice (last 7/30/90)
- **Campaigns table** — campaign, ad group, status, daily budget, spend, sales, ROAS, ACOS, impressions, clicks, CVR. Sort/filter/search. Inline status toggle (write-gated).
- **Keyword manager** — bid, match type, impressions, clicks, spend, attributed sales, ACOS, conversion rate, suggested bid. Bulk select → "raise / lower / pause / move to negatives".
- **Search-term harvest** — actual search queries that triggered ads, with one-click "promote to keyword" or "add as negative".
- **Product diagnostics** — per-SKU sales velocity, eligibility, OOS flags (so we don't spend on items we can't ship).
- **Dayparting & geo** — heatmap of conversion by hour/state; recommendations to shift budget.
- **Recommendations feed** — AI-generated actions (raise bid on X, pause Y, add negative Z) with one-click apply (or deep-link to Ads Manager when partner write API isn't live).

### 2. Cross-platform Keyword Optimizer — `/kennel/keywords`
One unified keyword table across **Instacart, Google Ads, Microsoft Ads, Amazon Ads** (and any future platform). Each keyword row shows:
- Platform • match type • bid • impressions • clicks • spend • conversions • ACOS • quality/relevance score • suggested bid
- "Cross-pollinate" action: a high-performing keyword on Google → suggest adding to Instacart/Microsoft with appropriate bid translation
- Negative-keyword sync across platforms (a search term wasting budget on Google probably wastes it on Microsoft too)

### 3. Microsoft Ads (Bing) integration
Yes — we should run it. Typical wine/CPG advertisers see Microsoft Ads CPCs **30–50% lower than Google** with often-higher conversion rates on the older / higher-income Bing audience. Microsoft also exposes **Retail Media** for sponsored placements across their retail partner network.

- Microsoft Advertising **REST API** (the SOAP API is being deprecated Jan 2027) for campaign / ad group / keyword CRUD + reporting
- OAuth2 (developer token + customer ID + refresh token, same pattern as Google Ads)
- Add tile in Kennel Integrations and a new **MicrosoftAdsConnector** edge function

### 4. Platform Discovery Engine — `/kennel/platform-radar`
A background job + dashboard tile that constantly evaluates new and emerging ad platforms for fit. It:
- Maintains a **canonical list** of ad platforms (Google, Meta, Microsoft, TikTok, Pinterest, Reddit, Snapchat, Amazon DSP, Yahoo DSP, The Trade Desk, Criteo, StackAdapt, AdRoll, Quora, LinkedIn, Nextdoor, Spotify Ads, Roku Ads, Vizio Ads, Samsung Ads, plus retail media: Walmart Connect, Kroger Precision, Target Roundel, Albertsons, Sam's MAP, Instacart, Swiftly, Rosie, etc.)
- Scores each on: **expected CPC, audience fit for wine/rescue mission, age-gating support, alcohol policy, minimum spend, API maturity, our compliance footprint**
- Pulls fresh intelligence weekly via Firecrawl + Lovable AI to detect new platforms, policy changes, beta programs
- Surfaces a **"Try this next"** alert tile on the Kennel dashboard when a new candidate scores above threshold (e.g. "Spotify Ads now supports state-level geo for alcohol — projected CAC $18 vs current $34. Apply?")

### 5. Kennel Dashboard tiles (additions)
- **Instacart Ads** tile — spend MTD, ROAS, top mover, "3 recommendations pending"
- **Keyword Optimizer** tile — "12 cross-platform opportunities, est. +$X/wk if applied"
- **Platform Radar** tile — "1 new platform recommended" badge

---

## Technical sections

### Database (new tables)
- `ad_platforms` — canonical list, status (active/candidate/rejected), category, fit_score, last_evaluated_at, metadata jsonb
- `ad_campaigns` — platform, external_id, name, status, budget_cents, last_synced_at
- `ad_groups` — campaign_id, external_id, name, status, default_bid_cents
- `ad_keywords` — ad_group_id, platform, keyword, match_type, bid_cents, status, last_30d metrics (impressions, clicks, spend, conversions, sales_cents)
- `ad_search_terms` — keyword_id, query, impressions, clicks, conversions, suggested_action (promote/negative/ignore)
- `ad_recommendations` (already exists per `kennel_review_recommendation` fn) — extend `metadata` to handle keyword-bid changes
- `platform_radar_alerts` — platform_id, alert_type (new/policy_change/opportunity), summary, recommended_action, dismissed_at
- All tables RLS-restricted to `is_ad_ops()` (already defined)

### Edge functions
- `instacart-ads-sync` — pulls reports (partner API when secrets present, else parses uploaded CSV). Already have `INSTACART_ADS_*` secrets in place.
- `instacart-ads-write` — write-path: pause/enable, bid changes, negative keywords. Gated by `partner_api_enabled` flag.
- `microsoft-ads-sync` + `microsoft-ads-write` — same pattern, new connector secrets needed
- `google-ads-sync` / `google-ads-write` — already partial; extend
- `keyword-recommender` — runs nightly cron, uses Lovable AI (`google/gemini-2.5-pro`) over the unified keyword/search-term dataset to produce ranked recommendations
- `platform-radar` — weekly cron; uses Firecrawl to scrape platform docs + AI Gateway to score & write `platform_radar_alerts`

### Secrets needed
- **Instacart API Partner credentials** (apply through rep; placeholder added to Integrations page now)
- **Microsoft Ads**: `MS_ADS_DEVELOPER_TOKEN`, `MS_ADS_CLIENT_ID`, `MS_ADS_CLIENT_SECRET`, `MS_ADS_REFRESH_TOKEN`, `MS_ADS_CUSTOMER_ID`, `MS_ADS_ACCOUNT_ID`
- Firecrawl is already connected (for platform-radar scraping)

### Cron
- `instacart-ads-sync` hourly
- `microsoft-ads-sync` + `google-ads-sync` hourly
- `keyword-recommender` nightly 3am
- `platform-radar` weekly Sunday 4am

---

## Suggested rollout

**Phase 1 (this build):**
1. Schemas + RLS
2. `/kennel/instacart-ads` dashboard skeleton + report ingestion (CSV upload while we wait for partner API)
3. Kennel tile
4. Apply for Instacart API Partner status (you do this with your rep; I add a status badge that flips when secrets land)

**Phase 2:**
5. Cross-platform keyword optimizer UI + recommender cron
6. Microsoft Ads connector (request secrets when you confirm)

**Phase 3:**
7. Platform Radar engine + alerts

---

## Decisions I need from you
1. **Start with Phase 1 only**, or build all three phases now (will be a much longer single push)?
2. **Microsoft Ads** — confirm you want me to wire it (I'll request the 6 secrets when we get to Phase 2)
3. **Recommender autonomy** — should keyword recommendations require manual approval (same pattern as `ad_recommendations` today), or auto-apply within guardrails (e.g. bid changes ≤ ±15%, no daily budget over $X)?
4. **Platform Radar alert threshold** — alert me when a new platform scores ≥ what? (default: 75/100)
