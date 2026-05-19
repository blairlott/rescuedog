import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Row = {
  state: string;
  modifier: number;
  customers: number | null;
  orders: number | null;
  revenue_cents: number | null;
  avg_ltv_cents: number | null;
  repeat_rate_pct: number | null;
  tier: string | null;
  computed_at: string;
};

const tierStyle = (t: string | null) => {
  if (t === "A") return "bg-green-600 text-white";
  if (t === "B") return "bg-muted text-foreground";
  if (t === "C") return "bg-yellow-100 text-yellow-900";
  return "bg-muted/50 text-muted-foreground";
};

const fmt$ = (cents: number | null) =>
  cents == null ? "—" : `$${Math.round(cents / 100).toLocaleString()}`;

const fmtPct = (mod: number) => {
  const p = (mod - 1) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(0)}%`;
};

export function GeoModifiersPanel() {
  const [busy, setBusy] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["kennel-geo-modifiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_geo_modifiers" as any)
        .select("*")
        .order("revenue_cents", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return ((data as any) ?? []) as Row[];
    },
    staleTime: 60 * 1000,
  });

  const recompute = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("kennel-recompute-geo-modifiers");
      if (error) throw error;
      toast.success("Geo modifiers recomputed");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Recompute failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs uppercase tracking-brand font-bold">Geo Bid Modifiers</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Lifetime consumer LTV per state · top 20</p>
        </div>
        <Button size="sm" variant="outline" onClick={recompute} disabled={busy}>
          <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet — hit Recompute.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-brand text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 text-left">State</th>
              <th className="py-1.5 text-center">Tier</th>
              <th className="py-1.5 text-right">Bid Mod</th>
              <th className="py-1.5 text-right">LTV</th>
              <th className="py-1.5 text-right">Repeat</th>
              <th className="py-1.5 text-right">Customers</th>
              <th className="py-1.5 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.state} className="border-b border-border last:border-0">
                <td className="py-1.5 font-bold">{r.state}</td>
                <td className="py-1.5 text-center">
                  <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold ${tierStyle(r.tier)}`}>{r.tier ?? "—"}</span>
                </td>
                <td className="py-1.5 text-right tabular-nums font-bold">{fmtPct(Number(r.modifier))}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt$(r.avg_ltv_cents)}</td>
                <td className="py-1.5 text-right tabular-nums">{r.repeat_rate_pct ?? 0}%</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{(r.customers ?? 0).toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums">{fmt$(r.revenue_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[10px] text-muted-foreground mt-3">
        Push as state-level bid adjustments in Meta/Google. A = bid up, B = baseline, C = efficient niche.
      </p>
    </div>
  );
}