import { Link } from "react-router-dom";
import { ArrowLeft, Database, Cpu, ShieldCheck, RefreshCw } from "lucide-react";

export default function KennelMethodologyPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <Link to="/kennel" className="inline-flex items-center gap-1 text-xs uppercase tracking-brand font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to Command Center
      </Link>

      <header>
        <h1 className="text-2xl md:text-3xl font-bold uppercase tracking-brand text-foreground" style={{ fontFamily: '"Nunito Sans", system-ui, sans-serif' }}>
          How the Kennel is built
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          A transparent look at the data sources, AI assistance, and refresh cadence behind every number on the Command Center.
        </p>
      </header>

      <section className="border-2 border-foreground p-4 space-y-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">Data sources</h2>
        </div>
        <ul className="text-sm text-foreground space-y-2 list-disc pl-5">
          <li><strong>Meta Ads, Google Ads, Instacart Ads</strong> — pulled nightly via official APIs into <code className="text-xs">ad_performance_daily</code>.</li>
          <li><strong>Vinoshipper</strong> — DTC orders, abandoned carts, and customers synced into <code className="text-xs">vs_transactions</code> and <code className="text-xs">vs_abandoned_carts</code>.</li>
          <li><strong>Brick &amp; mortar</strong> — distributor depletions, off-premise retail, and on-premise sales ingested from Lindy into <code className="text-xs">business_revenue_facts</code>.</li>
          <li><strong>QuickBooks finance</strong> — COGS, cost of sales, and operating expenses streamed from Lindy into <code className="text-xs">business_expense_facts</code>.</li>
          <li><strong>GA4 + Meta CAPI</strong> — server-side conversion events for attribution and audience health.</li>
        </ul>
      </section>

      <section className="border-2 border-foreground p-4 space-y-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">AI assistance</h2>
        </div>
        <ul className="text-sm text-foreground space-y-2 list-disc pl-5">
          <li><strong>Channel normalization</strong> — Lovable AI maps campaign names from each ad platform into a unified channel taxonomy.</li>
          <li><strong>True ROAS attribution</strong> — DTC revenue from Vinoshipper is matched back to ad spend using click IDs (fbclid/gclid), CAPI events, and a holdout-tested attribution window.</li>
          <li><strong>Recommendations</strong> — nightly the AI flags underperforming campaigns, budget reallocation opportunities, and creative fatigue. Every recommendation is human-reviewed before execution.</li>
          <li><strong>Anomaly detection</strong> — sudden spend spikes, ROAS collapses, or sync gaps surface as alerts at the top of the dashboard.</li>
        </ul>
      </section>

      <section className="border-2 border-foreground p-4 space-y-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">Refresh cadence</h2>
        </div>
        <ul className="text-sm text-foreground space-y-2 list-disc pl-5">
          <li>Ad platforms — every 6 hours, with a full backfill at 04:00 UTC.</li>
          <li>Vinoshipper DTC — every hour for new orders, full sweep nightly.</li>
          <li>Brick &amp; mortar (Lindy) — nightly at 04:00 UTC, with weekly distributor depletion pulls Monday 03:00 PT.</li>
          <li>QuickBooks finance (Lindy) — nightly at 03:30 UTC, with a 35-day re-pull at month end.</li>
          <li>If any source is silent &gt; 25 hours, a banner appears at the top of the dashboard.</li>
        </ul>
      </section>

      <section className="border-2 border-foreground p-4 space-y-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">Trust &amp; access</h2>
        </div>
        <ul className="text-sm text-foreground space-y-2 list-disc pl-5">
          <li>All ingest endpoints require an internal secret; no public writes.</li>
          <li>Row-level security restricts read access to owners, admins, ad-ops managers, executives, and Kennel viewers (e.g. CFO, CCO).</li>
          <li>Every AI recommendation is logged with timestamp, actor, and payload in the Execution log.</li>
          <li>Source-of-truth: Vinoshipper for DTC revenue, QuickBooks for finance, distributor reports for depletions. The dashboard never overrides these — it only aggregates.</li>
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Questions or need a deeper walkthrough? Reach out to the ad-ops team — every number on the Command Center can be traced back to its raw source.
      </p>
    </div>
  );
}