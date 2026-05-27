import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/kennel/MetricCard";
import { Radar, ExternalLink, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Seo } from "@/components/Seo";

const sevColor: Record<string, string> = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-blue-500 text-white",
  info: "bg-muted text-foreground",
};

export default function KennelPlatformRadarPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: alerts = [] } = useQuery({
    queryKey: ["platform-radar-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_radar_alerts" as any)
        .select("*")
        .is("dismissed_at", null)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["all-platforms"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_platforms" as any).select("*").order("fit_score", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const counts = {
    active: platforms.filter((p) => p.status === "active").length,
    candidate: platforms.filter((p) => p.status === "candidate").length,
    rejected: platforms.filter((p) => p.status === "rejected").length,
  };

  async function scanNow() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("platform-radar-scan", { body: {} });
      if (error) throw error;
      toast.success(`${data?.saved ?? 0} new alerts`);
      qc.invalidateQueries({ queryKey: ["platform-radar-alerts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(id: string) {
    const { error } = await supabase
      .from("platform_radar_alerts" as any)
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["platform-radar-alerts"] });
  }

  return (
    <>
      <Seo noindex title="Kennel Platform Radar" />
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-brand flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" /> Platform Radar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Continuously evaluates new and emerging ad platforms. Recommends ones that fit our wine + rescue mission profile.
          </p>
        </div>
        <Button onClick={scanNow} disabled={busy}>
          <Sparkles className="h-4 w-4 mr-2" /> Scan now
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Open alerts" value={String(alerts.length)} />
        <MetricCard label="Active platforms" value={String(counts.active)} />
        <MetricCard label="Candidates" value={String(counts.candidate)} />
        <MetricCard label="Rejected" value={String(counts.rejected)} />
      </div>

      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-brand font-semibold text-muted-foreground">Open alerts</h2>
        {alerts.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No open alerts.</CardContent></Card>
        ) : alerts.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4 flex gap-4 items-start">
              <Badge className={sevColor[a.severity] ?? ""}>{a.severity}</Badge>
              <div className="flex-1">
                <div className="font-bold">{a.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{a.summary}</div>
                {a.recommended_action && (
                  <div className="text-xs mt-2 p-2 bg-muted">
                    <span className="font-semibold uppercase tracking-brand mr-2">Action:</span>
                    {a.recommended_action}
                  </div>
                )}
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span><Badge variant="outline">{a.platform_slug}</Badge></span>
                  <span>{a.alert_type}</span>
                  {a.source_url && (
                    <a href={a.source_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => dismiss(a.id)} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-brand font-semibold text-muted-foreground">Platform catalog</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr className="text-left">
                <th className="p-3">Platform</th><th className="p-3">Category</th>
                <th className="p-3">Status</th><th className="p-3 text-right">Fit</th>
                <th className="p-3">Alcohol</th><th className="p-3">API</th><th className="p-3">Notes</th>
              </tr></thead>
              <tbody>
                {platforms.map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3 font-medium">
                      {p.homepage_url ? <a className="hover:underline" href={p.homepage_url} target="_blank" rel="noreferrer">{p.display_name}</a> : p.display_name}
                    </td>
                    <td className="p-3 text-xs">{p.category}</td>
                    <td className="p-3"><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></td>
                    <td className="p-3 text-right tabular-nums font-semibold">{p.fit_score}</td>
                    <td className="p-3 text-xs">{p.alcohol_compliant == null ? "—" : p.alcohol_compliant ? "✓" : "✗"}</td>
                    <td className="p-3 text-xs">{p.api_maturity ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-md">{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}