import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronRight, Pause, Play, RefreshCw, Home } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type Platform = "meta" | "google" | "instacart";
type Level = "platform" | "campaign" | "adset" | "ad";

type Entity = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  objective?: string;
  optimization_goal?: string;
  updated_time?: string;
  resource_name?: string;
};

type Crumb = { level: Level; parent_id?: string; label: string };

const PLATFORMS: { id: Platform; label: string; live: boolean }[] = [
  { id: "meta", label: "Meta (Facebook/Instagram)", live: true },
  { id: "google", label: "Google Ads", live: true },
  { id: "instacart", label: "Instacart Ads", live: false },
];

const nextLevel: Record<Level, Level | null> = {
  platform: "campaign",
  campaign: "adset",
  adset: "ad",
  ad: null,
};

const entityTypeFor: Record<Exclude<Level, "platform">, "campaign" | "adset" | "ad"> = {
  campaign: "campaign",
  adset: "adset",
  ad: "ad",
};

function fmtBudget(cents?: string) {
  if (!cents) return "—";
  const n = Number(cents);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `$${(n / 100).toFixed(2)}/day`;
}

function statusTone(status?: string) {
  const s = (status ?? "").toUpperCase();
  if (s === "ACTIVE") return "bg-primary text-primary-foreground";
  if (s === "PAUSED" || s.includes("PAUSED")) return "bg-muted text-foreground";
  if (s === "ARCHIVED" || s === "DELETED") return "bg-destructive/20 text-destructive";
  return "bg-secondary text-foreground";
}

export default function KennelChannelsPage() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [items, setItems] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const current: Crumb | null = trail[trail.length - 1] ?? null;

  useEffect(() => {
    const q = (searchParams.get("platform") ?? "").toLowerCase();
    if (!q || platform) return;
    const match = PLATFORMS.find(p => p.id === q || q.includes(p.id));
    if (match) {
      setPlatform(match.id);
      setTrail([{ level: "campaign", label: `${match.id} · campaigns` }]);
    }
    // eslint-disable-next-line
  }, [searchParams]);

  const load = async () => {
    if (!platform || !current) {
      setItems([]); return;
    }
    setLoading(true);
    setNotConnected(false);
    try {
      const action =
        current.level === "campaign" ? "list_campaigns" :
        current.level === "adset" ? "list_adsets" :
        current.level === "ad" ? "list_ads" : null;
      if (!action) return;

      const { data, error } = await supabase.functions.invoke("kennel-meta-browse", {
        body: { platform, action, parent_id: current.parent_id },
      });
      if (error) throw error;
      if ((data as any)?.not_connected) {
        setNotConnected(true);
        setItems([]);
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      setItems(((data as any)?.items ?? []) as Entity[]);
    } catch (e: any) {
      toast.error(e.message ?? "Load failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [platform, current?.parent_id, current?.level]);

  const pickPlatform = (p: Platform) => {
    setPlatform(p);
    setTrail([{ level: "campaign", label: `${p} · campaigns` }]);
  };

  const drill = (e: Entity) => {
    if (!current) return;
    const next = nextLevel[current.level];
    if (!next) return;
    setTrail([...trail, { level: next, parent_id: e.id, label: e.name }]);
  };

  const jumpTo = (idx: number) => {
    setTrail(trail.slice(0, idx + 1));
  };

  const reset = () => {
    setPlatform(null);
    setTrail([]);
    setItems([]);
    setSearchParams({});
  };

  const toggle = async (e: Entity) => {
    if (!current || current.level === "platform" || !platform) return;
    const entity_type = entityTypeFor[current.level];
    const currentStatus = (e.status ?? "").toUpperCase();
    const next = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setBusy(e.id);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-meta-browse", {
        body: {
          platform,
          action: "set_status",
          entity_type,
          entity_id: e.id,
          resource_name: e.resource_name,
          status: next,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${entity_type} ${next === "ACTIVE" ? "resumed" : "paused"}`);
      setItems(prev => prev.map(x => x.id === e.id ? { ...x, status: next, effective_status: next } : x));
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const headerLabel = useMemo(() => {
    if (!platform) return "Channels";
    if (!current) return platform;
    return current.level === "campaign" ? "Campaigns"
      : current.level === "adset" ? "Ad sets"
      : current.level === "ad" ? "Ads"
      : platform;
  }, [platform, current]);

  // --- Platform picker ---
  if (!platform) {
    return (
      <div className="p-6 max-w-[1400px]" style={BRAND_FONT}>
        <h1 className="text-3xl font-bold uppercase tracking-brand mb-2">Channels</h1>
        <p className="text-sm text-muted-foreground mb-6">Pick a platform to drill into campaigns, ad sets, and ads. Pause or resume anything remotely.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {PLATFORMS.map(p => (
            <button
              key={p.id}
              onClick={() => pickPlatform(p.id)}
              className="border border-border bg-card p-5 text-left hover:border-primary transition-colors"
              style={SHARP}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold uppercase tracking-brand text-foreground">{p.label}</div>
                <Badge style={SHARP} className={p.live ? "" : "bg-muted text-muted-foreground"}>
                  {p.live ? "LIVE" : "STUB"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {p.live ? "Live API drill-down + remote pause/resume." : "Not connected yet — coming soon."}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- Drill-down view ---
  return (
    <div className="p-6 max-w-[1400px]" style={BRAND_FONT}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button onClick={reset} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Home className="h-3 w-3" /> Channels
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          <span className="uppercase tracking-brand font-bold">{platform}</span>
          {trail.map((c, i) => (
            <span key={i} className="flex items-center gap-2">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => jumpTo(i)}
                className={`${i === trail.length - 1 ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>
        <Button size="sm" variant="outline" style={SHARP} onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <h2 className="text-2xl font-bold uppercase tracking-brand mb-3">{headerLabel}</h2>

      {notConnected ? (
        <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={SHARP}>
          <div className="font-bold uppercase tracking-brand text-foreground mb-1">Not connected</div>
          {platform} doesn't have an API token wired yet. Add one in Lovable Cloud secrets to enable this view.
        </div>
      ) : loading ? (
        <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={SHARP}>Loading from {platform}…</div>
      ) : items.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center text-sm text-muted-foreground" style={SHARP}>No {headerLabel.toLowerCase()} found.</div>
      ) : (
        <div className="border border-border bg-card" style={SHARP}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-brand text-muted-foreground border-b border-border">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                {current?.level !== "ad" && <th className="px-3 py-2">Budget</th>}
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => {
                const status = (e.status ?? "").toUpperCase();
                const canDrill = current && nextLevel[current.level] !== null;
                const canToggle = !["ARCHIVED", "DELETED"].includes(status);
                return (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-3 py-3">
                      <div className="font-bold text-foreground">{e.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{e.id}</div>
                      {(e.objective || e.optimization_goal) && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {e.objective ?? e.optimization_goal}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge style={SHARP} className={`text-[10px] uppercase ${statusTone(e.effective_status ?? e.status)}`}>
                        {e.effective_status ?? e.status ?? "—"}
                      </Badge>
                    </td>
                    {current?.level !== "ad" && (
                      <td className="px-3 py-3 text-xs">{fmtBudget(e.daily_budget)}</td>
                    )}
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {e.updated_time ? new Date(e.updated_time).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {canToggle && (
                          <Button
                            size="sm"
                            variant={status === "ACTIVE" ? "outline" : "default"}
                            style={SHARP}
                            disabled={busy === e.id}
                            onClick={() => toggle(e)}
                          >
                            {status === "ACTIVE"
                              ? (<><Pause className="h-3 w-3 mr-1" /> Pause</>)
                              : (<><Play className="h-3 w-3 mr-1" /> Resume</>)}
                          </Button>
                        )}
                        {canDrill && (
                          <Button size="sm" variant="outline" style={SHARP} onClick={() => drill(e)}>
                            Drill <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-4">
        All pause/resume actions are recorded in the Execution Log.
      </p>
    </div>
  );
}