## Vision

Turn `/finance` from a static tile grid into an **SAP Analytics Cloud–style workspace** the CFO can actually operate:

- Mirror **every Kennel tile** as a read-only block (he sees what marketing/ops see, in his own dashboard).
- Real **slice & dice**: pivot tables, custom charts, multi-layer overlays, drill-down, saved views.
- **Actionable insight cards** rendered next to each tile (auto-generated narrative + recommended action, persisted so he can dismiss / mark done).
- Dense, structured, monochrome SAP-style chrome (compact rows, sticky toolbars, fixed left rail, breadcrumbed boards).

## Audit of what exists

Already shipped (will reuse, not rebuild):
- `FinanceTiles.tsx` — 10 KPI tiles wired to `finance_*` RPCs and `vs_transactions` (just fixed)
- `qbo-import-pnl` edge function (just shipped) — feeds `bm_finance_entries`
- `ChartBuilder.tsx`, `PivotBuilder.tsx`, `SavedViewsPanel.tsx`, `UploadDatasetDialog.tsx` — partial primitives, surfaced today only via `FinanceWorkspace.tsx`
- `cfo_dashboard_layouts` table — already persists tile choice + date range
- Kennel: `KennelDashboard.tsx` and supporting tile components exist under `src/components/kennel/...`

Gaps:
- No registry/catalog of Kennel tiles for cross-board use
- Boards (multi-page dashboards) and stacked layouts aren't supported
- No insight engine
- Chart/Pivot builders aren't fed by a unified dataset registry
- Visual chrome is shadcn-default, not SAP-dense

## Build plan

### Phase 1 — Information architecture (foundation, ~1 turn)

1. **Tile registry** (`src/lib/financeTileRegistry.ts`):
   - Single source of truth: `{ key, title, source, group, defaultSpan, component, datasetKey, supportsInsight }`
   - Re-exports current QB / VS / CC tiles **plus wrappers** around Kennel components (mounted read-only with `viewerOverride='cfo_readonly'` prop).

2. **Kennel mirror wrappers** (`src/components/finance/kennel-mirrors/`):
   - One wrapper per Kennel tile we expose: ROAS leaderboard, Channel Mix, Funnel, Anomalies, Creative performance, Pixel signal health, Cohort retention, LTV/CAC, Top campaigns, Audience saturation, etc.
   - Each calls the same RPCs the Kennel uses, no writes, no edit affordances.
   - Catalogued in the registry so the "Add report" dropdown lists them under a new **Kennel (read-only)** group.

3. **Boards model** (DB migration):
   - `cfo_boards` (id, user_id, name, slug, position, layout jsonb)
   - `cfo_board_tiles` (id, board_id, tile_key, position, span, config jsonb)
   - `cfo_insights` (id, user_id, tile_key, board_id, severity, headline, body, recommended_action, status [open/done/dismissed], generated_at)
   - RLS: viewer is self only; admin/owner read all.
   - Replace the single saved layout with multi-board navigation.

### Phase 2 — SAP-style workspace shell (~1 turn)

4. **New `FinanceWorkspaceLayout`**:
   - Fixed left rail: board list + "+ New board"; collapses to icons.
   - Top bar: breadcrumb (Workspace › Board › View), period selector, compare-period toggle, currency, refresh-all.
   - Right rail (toggleable): **Insights drawer** showing all open insights across the active board.
   - Dense typography (12px base in workspace), sharp borders, mono numeric font for tabular data, zebra rows.

5. **Tile container**:
   - Header row with chip (source), title, span control (3/4/6/12), drag handle, "i" → opens insight side panel, "⋯" → duplicate / move to board / pin / remove.
   - Optional **footer insight strip**: 1-line auto-generated narrative + "View" link to the insight side panel.
   - Stack mode: two tiles can be stacked vertically inside one grid cell (e.g. KPI on top of trendline).

### Phase 3 — Slice & dice engine (~1 turn)

6. **Dataset registry** (`src/lib/financeDatasets.ts`):
   - Declarative descriptors for each queryable dataset: VS transactions, bm_finance_entries, Kennel attribution rollup, wine_club_memberships, loyalty_ledger.
   - Each declares: `dimensions[]`, `measures[]`, `dateField`, server fetch fn, optional `partitionBy`.

7. **Pivot Builder v2** (rewrite of `PivotBuilder.tsx`):
   - Dataset picker → rows / columns / values / filters drag-drop (using existing dnd-kit).
   - Aggregations: sum, avg, count, distinct count, %, weighted avg.
   - Totals + subtotals + variance vs prior period column.
   - Sticky first column, sticky header, horizontal scroll.
   - "Save as tile" → registers as a custom tile in the registry (persisted in `cfo_board_tiles.config`).

8. **Chart Builder v2** (rewrite of `ChartBuilder.tsx`):
   - Same dataset picker; chart types: line, bar, stacked bar, area, combo (line + bar), scatter, pie, funnel, heatmap.
   - Multi-series overlay (e.g. revenue + ad spend + ROAS on dual y-axis).
   - Drill-down: click a bar → opens pivot pre-filtered to that slice.
   - "Save as tile".

9. **Cross-tile filters**:
   - Board-level filter bar (state, channel, customer segment, ambassador) applied to all tiles that opt in via dataset registry.

### Phase 4 — Insight engine (~1 turn)

10. **Edge function `cfo-insights-generate`**:
    - On demand (per board) or nightly cron.
    - For each tile on the board, runs heuristics on the tile's underlying dataset (variance vs prior 28d, spike detection, % share shifts, churn deltas, ROAS dips, top-mover detection).
    - For anything material, calls Lovable AI (`google/gemini-2.5-flash`) with a structured prompt → returns `{severity, headline, body ≤ 280 chars, recommended_action ≤ 120 chars}`.
    - Writes to `cfo_insights`; deduplicates by hash of (tile_key + headline) within 24h.
    - Owner / admin / cfo only.

11. **Insight side panel** (already part of Phase 2 shell):
    - List grouped by severity (critical / watch / fyi).
    - Each card: headline, body, recommended action, "Mark done", "Dismiss", "Open tile".
    - "Refresh insights" button → invokes the edge function.

### Phase 5 — Polish (~1 turn)

12. SAP-style theme additions to `index.css`:
    - `--finance-bg`, `--finance-rail`, `--finance-rule`, dense table tokens, ag-grid-style hover.
    - Compact numeric font stack (`'JetBrains Mono', ui-monospace, ...`) for all tabular cells.

13. Keyboard nav inside pivots, CSV export per tile, print-friendly board view.

14. Update Lindy manual changelog with the new RPCs / edge function / tile registry.

## What I need from you before I start

This is multi-phase. I propose:
- **Build Phases 1–2 first** (registry + Kennel mirrors + SAP shell + multi-board nav) so the structural change ships and you can use it.
- **Then Phase 3** (slice & dice).
- **Then Phase 4** (insight engine).
- **Then Phase 5** (polish).

Two decisions:

1. **Which Kennel tiles do you want mirrored?** Default: all of them, marked read-only. Say "all" and I'll mirror the full catalog. Or list specific ones.
2. **Insight engine**: OK to use the Lovable AI Gateway (`google/gemini-2.5-flash`) for narrative generation, with deterministic heuristics for the trigger logic? It uses your existing `LOVABLE_API_KEY` — no new secrets needed.

Reply with "go" and your two answers and I'll start Phase 1.