// Registry of every tile available in the CFO dashboard.
// Add new tiles here — the dashboard auto-renders them and the AddTileMenu
// auto-lists them in its dropdown grouped by `source`.

export type FinanceTileSource = "quickbooks" | "vinoshipper" | "command_center" | "kennel_mirror";

export interface FinanceTileDef {
  key: string;
  source: FinanceTileSource;
  title: string;
  description: string;
  /** Default span on a 12-col grid. */
  defaultSpan: 3 | 4 | 6 | 12;
}

export const FINANCE_TILES: FinanceTileDef[] = [
  // QuickBooks (powered by Lindy → bm_finance_entries)
  { key: "qb_pnl",         source: "quickbooks", title: "P&L Summary",            description: "Revenue, COGS, expenses, refunds, net.", defaultSpan: 6 },
  { key: "qb_revenue_ch",  source: "quickbooks", title: "Revenue by Channel",     description: "DTC, wholesale, wine club, merch.",       defaultSpan: 6 },
  { key: "qb_ad_spend",    source: "quickbooks", title: "Ad Spend by Platform",   description: "Meta, Google, Instacart, other.",         defaultSpan: 6 },
  { key: "qb_cash_trend",  source: "quickbooks", title: "Cash In vs Cash Out",    description: "Weekly cash flow trend.",                 defaultSpan: 12 },
  { key: "qb_top_vendors", source: "quickbooks", title: "Top Expense Vendors",    description: "Largest vendor spend in range.",           defaultSpan: 6 },

  // Vinoshipper
  { key: "vs_summary",     source: "vinoshipper", title: "Vinoshipper Sales",     description: "Orders, AOV, revenue split.",             defaultSpan: 6 },
  { key: "vs_wc_vs_alc",   source: "vinoshipper", title: "Wine Club vs À la Carte", description: "Recurring vs one-off revenue.",        defaultSpan: 6 },
  { key: "vs_waterfall",   source: "vinoshipper", title: "Revenue Waterfall (Gross → Net → After COGS & Ads)", description: "Gross, net of discounts, after COGS, after converting ad spend.", defaultSpan: 6 },

  // Command Center (read-only imports)
  { key: "cc_roas",        source: "command_center", title: "Revenue / ROAS / Spend", description: "Blended marketing efficiency.",        defaultSpan: 6 },
  { key: "cc_wine_club",   source: "command_center", title: "Wine Club MRR & Churn", description: "Active members, MRR, cancellations.",   defaultSpan: 6 },
  { key: "cc_pathways",    source: "command_center", title: "Conversion Pathways",   description: "Guest→club rate and à la carte.",        defaultSpan: 6 },

  // Kennel read-only mirrors
  { key: "km_ad_command",   source: "kennel_mirror", title: "Ad Command (Mirror)",     description: "Instacart, keywords, radar alerts — read-only.", defaultSpan: 12 },
  { key: "km_system_health",source: "kennel_mirror", title: "Kennel System Health",   description: "Live ingestion + autopilot health strip.",       defaultSpan: 12 },
  { key: "km_cron",         source: "kennel_mirror", title: "Kennel Cron Status",     description: "Latest run state for each scheduled job.",       defaultSpan: 6 },
  { key: "km_ingestion",    source: "kennel_mirror", title: "Ingestion Status",       description: "Last successful pull per data source.",          defaultSpan: 6 },
  { key: "km_retention",    source: "kennel_mirror", title: "Retention Risk",         description: "Customers most likely to churn (mirror).",       defaultSpan: 6 },
  { key: "km_pathways",     source: "kennel_mirror", title: "Conversion Pathways (Mirror)", description: "Same pathways panel as Kennel.",          defaultSpan: 6 },
];

export const TILE_BY_KEY: Record<string, FinanceTileDef> = Object.fromEntries(
  FINANCE_TILES.map(t => [t.key, t])
);

export const SOURCE_LABEL: Record<FinanceTileSource, string> = {
  quickbooks: "QuickBooks",
  vinoshipper: "Vinoshipper",
  command_center: "Command Center",
  kennel_mirror: "Kennel (Read-only)",
};

export const DEFAULT_TILE_KEYS: string[] = [
  "qb_pnl",
  "qb_revenue_ch",
  "qb_ad_spend",
  "qb_cash_trend",
  "vs_summary",
  "cc_roas",
];

export function fmtCents(cents: number | null | undefined): string {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}