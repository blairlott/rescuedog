## What I found

I dug into why the tiles are empty even though you "pulled data". Two distinct problems, only one of them is what you think:

### 1. Vinoshipper tile is broken at the SQL level
The `finance_vs_summary` RPC sums a column called `total_cents` — that column **does not exist** on `vs_transactions`. The real money column is `order_total` (dollars). So every Vinoshipper tile call has been silently returning zero rows since this RPC shipped. There are **8,589 VS transactions** in the DB, with data as recent as 2026-05-17. It's purely a column-name bug.

### 2. QuickBooks "Pull P&L" doesn't actually persist anything
The Pull P&L button in the QuickBooks panel fetches the report from Intuit and renders the JSON in the panel. It **never writes to `bm_finance_entries`**, which is what the QB tiles (`finance_pnl_summary`, `finance_revenue_by_channel`, `finance_cash_trend`, etc.) read from.

The 604 existing rows in `bm_finance_entries` are a one-time backfill: all `revenue / quickbooks` entries dated 2022-01-03 → 2025-05-16. The default tile window is "Last 90 days" → there is literally zero data in the window the tiles ask for, so they correctly show "No data in range".

So the QB tiles aren't "broken" — they're starving. We never built the live QBO → finance ingestion.

## What I'll build

### Step 1 — Fix the VS RPC (5 min, immediate effect)

Migration to replace `finance_vs_summary`:
- Replace `SUM(t.total_cents)` with `SUM(ROUND(t.order_total * 100))::bigint`
- Same for `wine_club_cents`, `ala_carte_cents`, `wholesale_cents`, `aov_cents`
- Keep signature and permission check identical

After this: the Vinoshipper Summary and Wine Club vs À la Carte tiles light up using existing data.

### Step 2 — Build a QBO → Finance importer

New edge function `qbo-import-pnl` that:
- Takes `start_date`, `end_date` from the caller
- Reuses the existing QBO connection + token-refresh logic
- Calls QuickBooks `ProfitAndLoss` (and optionally a couple of other reports)
- Walks the row tree and emits one `bm_finance_entries` row per account-line for the period, using:
  - `external_id` = `qbo:<realm>:<report>:<account>:<period_start>` (idempotent upsert)
  - `entry_type` = `revenue` for Income, `cogs` for COGS, `expense` for Expenses
  - `category` = account group name, `account_name` / `account_code` from QBO
  - `amount_cents` = QBO dollar amount × 100
  - `date` = period end (or month buckets if we choose monthly granularity — I'll default to monthly buckets so the cash trend chart works)
  - `source` = `quickbooks`
- Returns `{ imported: N, skipped: N, range }`

Add an **"Import to Finance"** button next to "Pull P&L" in `QuickBooksPanel.tsx`. It calls the new function for the selected date range, invalidates the finance React Query keys, and tiles populate.

Optionally (call it out for you to approve separately): a daily cron that runs the import for the trailing 7 days so the dashboard stays fresh without you clicking.

### Step 3 — Confirm Vinoshipper ingestion is current

`vs_transactions` is up to date through 2026-05-17. The `vinoshipper-poll` function is in place. I won't touch it — if you want, I can also add a "Sync now" button on the dashboard, but that's optional.

### Out of scope (flag only, won't build unless you say so)
- Ad-spend tile (`finance_spend_by_platform`) needs ad-spend entries in `bm_finance_entries` with `subcategory IN ('meta_ads','google_ads','instacart_ads')`. None exist today. Hook up after QBO importer lands (most users put ad spend in QBO).
- Top Vendors tile depends on QBO importer Step 2 — will start working automatically once we import expense lines.

## Acceptance check after build

I'll run:
- `SELECT * FROM finance_vs_summary(now()-90, now())` returns non-zero
- Click Import to Finance for last 12 months → `SELECT COUNT(*) FROM bm_finance_entries WHERE source='quickbooks' AND date >= now()-90` is > 0
- Reload `/finance` → VS Summary, WC vs À la Carte, QB P&L, Revenue by Channel, Cash Trend, Top Vendors all show data

Sound good? If yes I'll execute steps 1 + 2 and report back with the verification numbers.