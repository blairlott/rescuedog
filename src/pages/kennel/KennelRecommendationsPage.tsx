import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Play, Undo2, Clock, Sparkles } from "lucide-react";

type Rec = {
  id: string;
  channel_id: string | null;
  kind: string;
  title: string;
  summary: string;
  rationale: string | null;
  projected_impact_cents: number;
  confidence: number;
  expires_at: string | null;
  status: string;
  source: string;
  payload: any;
  reviewed_at: string | null;
  executed_at: string | null;
  created_at: string;
  rejection_reason?: string | null;
};

const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;
const SHARP = { borderRadius: 0 } as const;

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
function timeLeft(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3.6e6);
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
}

export default function KennelRecommendationsPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"pending" | "approved" | "executed" | "rejected" | "failed" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: r }, { data: ch }] = await Promise.all([
      supabase.from("ad_recommendations").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("ad_channels").select("id,name"),
    ]);
    setRecs((r as Rec[]) ?? []);
    setChannels(Object.fromEntries((ch ?? []).map((c: any) => [c.id, c.name])));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("kennel-recs")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_recommendations" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const list = filter === "all" ? recs : recs.filter((r) => r.status === filter);
    if (filter === "pending") {
      // Newest first
      return [...list].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return list;
  }, [recs, filter]);

  const act = async (id: string, action: "approve" | "reject" | "execute" | "rollback") => {
    setBusy(id + ":" + action);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-execute", {
        body: { recommendation_id: id, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.already_handled) {
        toast.info("Already handled — refreshing list");
        await load();
      } else {
        const sup = (data as any)?.superseded ?? 0;
        toast.success(
          `Recommendation ${action}d${sup > 0 ? ` · ${sup} duplicate${sup === 1 ? "" : "s"} cleared` : ""}`,
        );
      }
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-[1400px]" style={BRAND_FONT}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-brand">Recommendations</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            Lindy is analyzing. Sorted by projected impact × confidence.
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["pending", "approved", "executed", "rejected", "failed", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              style={SHARP}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f} {f !== "all" && `(${recs.filter((r) => r.status === f).length})`}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={SHARP}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={SHARP}>
          No {filter === "all" ? "" : filter} recommendations.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const tl = timeLeft(r.expires_at);
            const expired = tl === "expired";
            return (
              <div key={r.id} className="border border-border bg-card p-4" style={SHARP}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" style={SHARP} className="uppercase text-[10px]">
                        {r.kind}
                      </Badge>
                      {r.channel_id && (
                        <Badge variant="secondary" style={SHARP} className="text-[10px]">
                          {channels[r.channel_id] ?? "—"}
                        </Badge>
                      )}
                      <Badge style={SHARP} className="text-[10px] uppercase">
                        {r.status}
                      </Badge>
                      {tl && (
                        <span className={`text-[11px] flex items-center gap-1 ${expired ? "text-destructive" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" /> {tl}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-foreground">{r.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{r.summary}</p>
                    {r.rationale && (
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Rationale</summary>
                        <p className="mt-1 whitespace-pre-wrap">{r.rationale}</p>
                      </details>
                    )}
                    {(r.status === "rejected" || r.status === "failed") && r.rejection_reason && (
                      <div
                        className="mt-2 border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                        style={SHARP}
                      >
                        <span className="font-bold uppercase tracking-brand mr-2">
                          {r.status === "rejected" ? "Rejected" : "Failed"}:
                        </span>
                        {r.rejection_reason}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-primary">{fmtMoney(r.projected_impact_cents)}</div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                      proj · {Math.round(r.confidence * 100)}% conf
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 border-t border-border pt-3">
                  {r.status === "pending" && !expired && (
                    <>
                      <Button
                        size="sm" variant="outline" style={SHARP}
                        disabled={busy?.startsWith(r.id)}
                        onClick={() => act(r.id, "reject")}
                      >
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm" style={SHARP}
                        disabled={busy?.startsWith(r.id)}
                        onClick={() => act(r.id, "approve")}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button
                      size="sm" style={SHARP}
                      disabled={busy?.startsWith(r.id)}
                      onClick={() => act(r.id, "execute")}
                    >
                      <Play className="h-3 w-3 mr-1" /> Execute
                    </Button>
                  )}
                  {r.status === "executed" && (
                    <Button
                      size="sm" variant="outline" style={SHARP}
                      disabled={busy?.startsWith(r.id)}
                      onClick={() => act(r.id, "rollback")}
                    >
                      <Undo2 className="h-3 w-3 mr-1" /> Rollback
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}