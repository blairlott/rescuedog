import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, RefreshCw, Search, ExternalLink } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Seo } from "@/components/Seo";

type SiteEntry = { siteUrl: string; permissionLevel: string };
type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
type GscResponse = { rows?: GscRow[]; responseAggregationType?: string };

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

function callGsc(action: "sites"): Promise<{ siteEntry?: SiteEntry[] }>;
function callGsc(action: "query", body: Record<string, unknown>): Promise<GscResponse>;
async function callGsc(action: string, body?: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke(`gsc-analytics?action=${action}`, {
    body: body ?? {},
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-border bg-background p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function CmsSearchConsolePage() {
  const { isCmsEditor, loading: authLoading } = useCmsAuth();
  const [siteUrl, setSiteUrl] = useState<string>("");
  const [startDate, setStartDate] = useState(fmt(daysAgo(28)));
  const [endDate, setEndDate] = useState(fmt(today()));
  const [search, setSearch] = useState("");

  const sitesQ = useQuery({
    queryKey: ["gsc-sites"],
    enabled: !authLoading && isCmsEditor,
    queryFn: () => callGsc("sites"),
  });

  const sites = sitesQ.data?.siteEntry ?? [];
  // Auto-pick first verified site (avoid sc-set-* permission-less entries).
  const effectiveSite = siteUrl || sites.find((s) => s.permissionLevel !== "siteUnverifiedUser")?.siteUrl || "";

  const baseParams = { siteUrl: effectiveSite, startDate, endDate };

  const totalsQ = useQuery({
    queryKey: ["gsc-totals", effectiveSite, startDate, endDate],
    enabled: !!effectiveSite,
    queryFn: () => callGsc("query", { ...baseParams, dimensions: [], rowLimit: 1 }),
  });

  const trendQ = useQuery({
    queryKey: ["gsc-trend", effectiveSite, startDate, endDate],
    enabled: !!effectiveSite,
    queryFn: () => callGsc("query", { ...baseParams, dimensions: ["date"], rowLimit: 1000 }),
  });

  const queriesQ = useQuery({
    queryKey: ["gsc-queries", effectiveSite, startDate, endDate],
    enabled: !!effectiveSite,
    queryFn: () => callGsc("query", { ...baseParams, dimensions: ["query"], rowLimit: 100 }),
  });

  const pagesQ = useQuery({
    queryKey: ["gsc-pages", effectiveSite, startDate, endDate],
    enabled: !!effectiveSite,
    queryFn: () => callGsc("query", { ...baseParams, dimensions: ["page"], rowLimit: 100 }),
  });

  const totals = totalsQ.data?.rows?.[0];
  const trend = useMemo(
    () =>
      (trendQ.data?.rows ?? []).map((r) => ({
        date: r.keys?.[0] ?? "",
        clicks: r.clicks,
        impressions: r.impressions,
      })),
    [trendQ.data],
  );

  const filteredQueries = useMemo(() => {
    const rows = queriesQ.data?.rows ?? [];
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => (r.keys?.[0] ?? "").toLowerCase().includes(s));
  }, [queriesQ.data, search]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isCmsEditor) return <Navigate to="/cms/login" replace />;

  const setRange = (days: number) => {
    setStartDate(fmt(daysAgo(days)));
    setEndDate(fmt(today()));
  };

  const refetchAll = () => {
    totalsQ.refetch();
    trendQ.refetch();
    queriesQ.refetch();
    pagesQ.refetch();
  };

  const nf = new Intl.NumberFormat("en-US");
  const pf = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-muted/20">
      <Seo title="Search Console" path="/cms/search-console" noindex />
      <div className="border-b border-border bg-background">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/cms" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">Google Search Console</h1>
              <p className="text-xs text-muted-foreground">
                Last {Math.round((+new Date(endDate) - +new Date(startDate)) / 86_400_000)} days · Data delayed ~2 days by Google.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Controls */}
        <div className="bg-background border border-border p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label className="text-xs">Property</Label>
            <Select value={effectiveSite} onValueChange={setSiteUrl} disabled={sitesQ.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={sitesQ.isLoading ? "Loading…" : "Pick a site"} />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.siteUrl} value={s.siteUrl}>
                    {s.siteUrl} {s.permissionLevel === "siteUnverifiedUser" ? "(unverified)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sitesQ.error && (
              <p className="text-xs text-destructive mt-1">{(sitesQ.error as Error).message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRange(7)}>7d</Button>
            <Button variant="outline" size="sm" onClick={() => setRange(28)}>28d</Button>
            <Button variant="outline" size="sm" onClick={() => setRange(90)}>90d</Button>
          </div>
        </div>

        {!effectiveSite && !sitesQ.isLoading && (
          <div className="bg-background border border-border p-6 text-sm text-muted-foreground">
            No verified properties found in Google Search Console.{" "}
            <a
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              Open Search Console <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and verify <span className="font-mono">rescuedogwines.com</span> first.
          </div>
        )}

        {/* Totals */}
        {effectiveSite && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Clicks" value={totals ? nf.format(totals.clicks) : "—"} />
            <StatCard label="Impressions" value={totals ? nf.format(totals.impressions) : "—"} />
            <StatCard label="CTR" value={totals ? pf(totals.ctr) : "—"} />
            <StatCard label="Avg position" value={totals ? totals.position.toFixed(1) : "—"} hint="Lower is better" />
          </div>
        )}

        {/* Trend */}
        {effectiveSite && (
          <div className="bg-background border border-border p-5">
            <h2 className="font-bold text-foreground mb-4">Clicks & impressions</h2>
            <div className="h-72">
              {trendQ.isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" fontSize={11} />
                    <YAxis yAxisId="l" fontSize={11} />
                    <YAxis yAxisId="r" orientation="right" fontSize={11} />
                    <Tooltip />
                    <Area yAxisId="r" type="monotone" dataKey="impressions" stroke="hsl(var(--muted-foreground))" fill="url(#g2)" />
                    <Area yAxisId="l" type="monotone" dataKey="clicks" stroke="hsl(var(--primary))" fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Queries + Pages */}
        {effectiveSite && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Queries */}
            <div className="bg-background border border-border">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
                <h2 className="font-bold text-foreground">Top queries</h2>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter…"
                    className="h-8 pl-7 w-44"
                  />
                </div>
              </div>
              <RowsTable
                loading={queriesQ.isLoading}
                rows={filteredQueries}
                keyLabel="Query"
              />
            </div>

            {/* Pages */}
            <div className="bg-background border border-border">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-bold text-foreground">Top pages</h2>
              </div>
              <RowsTable
                loading={pagesQ.isLoading}
                rows={pagesQ.data?.rows ?? []}
                keyLabel="Page"
                renderKey={(k) => (
                  <a href={k} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1 break-all">
                    {k.replace(/^https?:\/\/[^/]+/, "") || k}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RowsTable({
  loading,
  rows,
  keyLabel,
  renderKey,
}: {
  loading: boolean;
  rows: GscRow[];
  keyLabel: string;
  renderKey?: (key: string) => React.ReactNode;
}) {
  const nf = new Intl.NumberFormat("en-US");
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rows.length) {
    return <div className="p-6 text-sm text-muted-foreground">No data for this range.</div>;
  }
  return (
    <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 sticky top-0">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2">{keyLabel}</th>
            <th className="px-4 py-2 text-right">Clicks</th>
            <th className="px-4 py-2 text-right">Impr.</th>
            <th className="px-4 py-2 text-right">CTR</th>
            <th className="px-4 py-2 text-right">Pos.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const k = r.keys?.[0] ?? "";
            return (
              <tr key={`${k}-${i}`} className="border-t border-border/60 hover:bg-muted/20">
                <td className="px-4 py-2 max-w-[280px] truncate">{renderKey ? renderKey(k) : k}</td>
                <td className="px-4 py-2 text-right font-mono">{nf.format(r.clicks)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{nf.format(r.impressions)}</td>
                <td className="px-4 py-2 text-right font-mono">{(r.ctr * 100).toFixed(1)}%</td>
                <td className="px-4 py-2 text-right font-mono">{r.position.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}