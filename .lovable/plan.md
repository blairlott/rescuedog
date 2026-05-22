# CFO Finance Portal — Phase 2: Uploads + Pivot/Chart Builder

Builds on the existing /finance scaffold (FinanceLogin, FinanceDashboard, FinanceUsersPage, FinanceLayout, FinanceTiles). Wires routes into App.tsx and adds self-serve data upload + analysis.

## New capabilities

1. **File uploads** — CFO + finance users can upload CSV, XLSX, and PDF (parsed) directly into the portal. Each upload becomes a "dataset" with named columns and typed rows.
2. **Private vs Shared toggle** — at upload time the user picks `private` (only them) or `shared` (all finance roles). Switchable later by the owner.
3. **Pivot builder** — per-dataset UI with dropdowns for Rows, Columns, Values, Aggregation (sum / avg / count / min / max), plus a Filters chip row. Powered by `react-pivottable` for the multi-dim grid.
4. **Chart builder** — Recharts. Dropdowns: chart type (bar / line / area / pie / stacked bar), X-axis dim, Y-axis measure(s), group-by, aggregation. Renders below the pivot.
5. **Saved views** — name + persist the {dataset, pivot config, chart config, filters} bundle as a "view". Listed in a sidebar; one-click to reload. Toggle to mark a view as "Pin to dashboard" so it shows as a tile on `/finance`.
6. **Scheduled refresh** — for views built on `bm_finance_entries` / `vs_transactions` (live DB sources), a daily cron re-aggregates and emails a snapshot to the owner if "Email me daily" is on. For uploaded files this is a no-op (static snapshot).

## Data model (migration)

- `cfo_datasets` — id, owner_id, name, source_type (`upload`|`live_db`), source_ref (storage path or rpc name), visibility (`private`|`shared`), row_count, column_meta jsonb (`[{name,type}]`), created_at.
- `cfo_dataset_rows` — id, dataset_id, row_index, data jsonb (one row of the parsed file). Indexed on dataset_id.
- `cfo_saved_views` — id, owner_id, dataset_id, name, visibility, config jsonb (pivot + chart + filters), pinned_to_dashboard bool, email_daily bool.
- Storage bucket `cfo-finance` (private). RLS: owner can read own; finance roles can read shared.
- RLS via `can_view_finance(uid)` + per-row owner check for private.

## Edge function

- `cfo-parse-upload` — POST `{storage_path, dataset_name, visibility, source_format}`. Downloads the file, parses:
  - CSV → Deno `std/csv`
  - XLSX → SheetJS (`xlsx` from esm.sh)
  - PDF → `pdf-parse` text + table heuristics (single-table flat extraction)
  Infers column types (number / date / string), inserts `cfo_datasets` + `cfo_dataset_rows`, returns dataset_id. Auth-gated by `can_view_finance`.

## Frontend

New files under `src/pages/finance/` and `src/components/finance/`:
- `FinanceWorkspace.tsx` (new route `/finance/workspace/:datasetId?`) — three-pane: dataset list (left), pivot+chart builder (center), saved views (right).
- `UploadDatasetDialog.tsx` — drag/drop, format picker, visibility toggle, calls edge function.
- `PivotBuilder.tsx` — wraps `react-pivottable` with our dropdown chrome.
- `ChartBuilder.tsx` — Recharts (bar/line/area/pie/stacked) with field-picker dropdowns.
- `SavedViewsPanel.tsx` — list / rename / delete / pin / email-toggle.
- `useCfoDatasets.ts`, `useCfoViews.ts` — react-query hooks.

App.tsx route additions:
- `/finance/login`, `/finance`, `/finance/users`, `/finance/workspace`, `/finance/workspace/:datasetId`.
- Wrap all `/finance/*` (except login) in `FinanceLayout` + auth guard (`can_view_finance`).

## Dependencies

- `react-pivottable` (pivot grid + drag-drop chrome we hide in favor of dropdowns)
- `xlsx` (already available; check)
- `papaparse` for client-side CSV preview
- Recharts already installed.

## Scheduled refresh

Daily cron `cfo-refresh-views` (pg_cron + edge function) at 06:00 UTC: re-runs `live_db` views, snapshots results, emails owners with `email_daily=true` via Resend.

## Lindy manual

Append changelog entry to `/mnt/documents/Lindy_User_Manual_and_Roadmap.docx` covering: new tables, new edge function `cfo-parse-upload`, scheduled job, storage bucket.

## Out of scope (later)

- Live QuickBooks OAuth (still stubbed; Phase 3).
- Joining multiple datasets in one view.
- Formula/calculated columns.
- Excel export of views (can add a Download button if quick).

---

# (Previous) CFO Finance Portal — Phase 1

A locked-down `/finance` portal for the CFO and approved viewers. CFO sees only this dashboard — no exposure to CMS, CRM, Kennel, Wine Club admin, etc.

## Access model

New `cfo` app_role added to `app_role` enum. Helper `public.can_view_finance(uid)` returns true for `owner`, `admin`, `executive`, `cfo`, plus existing `viewer` users explicitly granted via the new finance grants table.

- **You (owner)**: full access + can grant/revoke `cfo` role and finance access to other users.
- **Jana (viewer)**: already a `viewer` — auto-granted finance access via `is_backend_viewer`.
- **CFO**: gets the `cfo` role from you. On login at `/finance/login`, lands directly on `/finance` and is blocked from `/admin`, `/crm`, `/cms`, `/kennel`, `/club`, `/dropship`. Existing admin layouts also exclude CFOs from their nav.

## Routes

```text
/finance/login      → standalone login (no admin chrome)
/finance            → dashboard (this is the ONLY route a pure-CFO can hit)
/finance/users      → owner-only: grant/revoke cfo role
/admin              → adds "Finance" tile (owner/admin/executive only)
```

A pure CFO who tries `/admin`, `/crm`, etc. is redirected to `/finance`.

## Dashboard layout

Single page with a configurable tile grid. Each tile has a dropdown picker in an "Add Report" toolbar so the CFO can compose his own view. Layout persists per-user in `cfo_dashboard_layouts` (jsonb).

### Tile categories

1. **QuickBooks (from `bm_finance_entries` — Lindy sync)**
   - P&L Summary (revenue / COGS / opex / net) — date range picker
   - Revenue by channel (DTC / wholesale / wine club / merch)
   - Ad spend by platform (Meta / Google / Instacart)
   - COGS by SKU
   - Cash in vs cash out trend
   - Top vendors / top expense categories

2. **Vinoshipper (from `vs_transactions`)**
   - Orders, AOV, revenue by day/week/month
   - DTC vs wholesale split
   - Top ship-to states
   - Wine club vs à la carte revenue

3. **Command Center read-only imports**
   - Revenue / ROAS / blended CAC / MER (Kennel `true_roas` view)
   - Wine Club MRR, active members, churn (existing `wine_club_*` queries)
   - Conversion Pathways summary (guest→club rate, median days, à la carte)

Each tile renders as a small card with KPI + sparkline/bar chart (Recharts). Date range filter at top of dashboard applies to all date-aware tiles.

### "Add Report" UX

Toolbar button → dropdown grouped by category (QB / Vinoshipper / Command Center) → click to add. Tiles can be removed/reordered.

## QuickBooks live API (Phase 2 — scaffolded but not wired)

Adds a `finance_qb_connection` table (encrypted OAuth tokens) and an empty `quickbooks-oauth` + `quickbooks-report` edge function pair stubbed with TODOs. Tiles will keep reading from `bm_finance_entries` until you create an Intuit developer app and add `QB_CLIENT_ID` / `QB_CLIENT_SECRET` secrets.

## Technical details

- **Migration**: add `cfo` to `app_role` enum; create `can_view_finance(uid)` and `is_cfo(uid)`; create `cfo_dashboard_layouts (user_id pk, tiles jsonb, updated_at)`; create `finance_qb_connection` stub table; new RPC `finance_pnl_summary(_start date, _end date)` that aggregates `bm_finance_entries` by `entry_type`; new RPC `finance_revenue_by_channel(_start, _end)`; new RPC `finance_spend_by_platform(_start, _end)`. All RPCs `SECURITY DEFINER`, gated by `can_view_finance`.
- **Frontend**: `src/pages/finance/FinanceLogin.tsx`, `src/pages/finance/FinanceDashboard.tsx`, `src/pages/finance/FinanceUsersPage.tsx`, `src/components/finance/FinanceLayout.tsx` (minimal chrome — no admin sidebar), `src/components/finance/tiles/*.tsx` (one per tile), `src/components/finance/AddTileMenu.tsx`, `src/lib/financeTiles.ts` (registry).
- **Routing**: add routes in `App.tsx`. A `RequireFinanceAccess` guard wraps `/finance/*`. Existing `CrmLayout` / `KennelDashboard` / `CmsDashboard` / `AdminPortalPage` add a redirect-to-`/finance` for pure-CFO users.
- **Admin nav**: add a "Finance" tile to `ADMIN_AREAS` (owner/admin/executive/cfo). CFO clicking it goes to `/finance`. Pure CFO never hits `/admin` because their login redirect points to `/finance`.
- **Manual update**: append changelog entry to Lindy manual per mem rule (new RPCs + finance portal surface).

## Out of scope (this round)

- Live QB OAuth flow (table + stub functions only — wire up when you create the Intuit app)
- PDF export of reports
- Scheduled email reports
