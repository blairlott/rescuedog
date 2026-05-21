import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { US_STATE_CENTROIDS } from "@/lib/usStateCentroids";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Cohort = {
  customer_email: string | null;
  segment: string | null;
  state: string | null;
  lifetime_revenue_cents: number;
  predicted_ltv_cents: number | null;
  churn_probability: number | null;
  is_club_member: boolean;
  orders_count: number;
  days_since_last_order: number | null;
};

const SEGMENT_COLORS: Record<string, string> = {
  champion: "#16a34a",
  loyal: "#2563eb",
  club_member: "#7c3aed",
  regular: "#0891b2",
  at_risk: "#f59e0b",
  lost: "#dc2626",
  one_time: "#94a3b8",
};

const SEGMENTS = ["champion", "loyal", "club_member", "regular", "at_risk", "lost", "one_time"];

export default function CrmCustomerMapPage() {
  const [rows, setRows] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set(SEGMENTS));
  const [minLtv, setMinLtv] = useState(0);
  const [clubOnly, setClubOnly] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("customer_cohorts")
        .select("customer_email,segment,state,lifetime_revenue_cents,predicted_ltv_cents,churn_probability,is_club_member,orders_count,days_since_last_order")
        .limit(10000);
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (!r.state) return false;
    if (clubOnly && !r.is_club_member) return false;
    if (r.segment && !selected.has(r.segment)) return false;
    if ((r.lifetime_revenue_cents ?? 0) < minLtv * 100) return false;
    return true;
  }), [rows, selected, clubOnly, minLtv]);

  const byState = useMemo(() => {
    const m = new Map<string, { count: number; ltv: number; segs: Record<string, number> }>();
    for (const r of filtered) {
      const s = (r.state || "").toUpperCase();
      if (!s) continue;
      const cur = m.get(s) ?? { count: 0, ltv: 0, segs: {} };
      cur.count += 1;
      cur.ltv += r.lifetime_revenue_cents || 0;
      if (r.segment) cur.segs[r.segment] = (cur.segs[r.segment] || 0) + 1;
      m.set(s, cur);
    }
    return m;
  }, [filtered]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const maxCount = Math.max(1, ...Array.from(byState.values()).map(v => v.count));
    for (const [st, v] of byState.entries()) {
      const c = US_STATE_CENTROIDS[st];
      if (!c) continue;
      const dominant = Object.entries(v.segs).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "regular";
      const color = SEGMENT_COLORS[dominant] ?? "#64748b";
      const radius = 8 + Math.sqrt(v.count / maxCount) * 35;
      const marker = L.circleMarker(c, {
        radius, color, weight: 1.5, fillColor: color, fillOpacity: 0.55,
      });
      marker.bindPopup(`
        <div style="min-width:180px">
          <p style="font-weight:bold;margin:0 0 4px">${st} — ${v.count} customers</p>
          <p style="font-size:12px;margin:0 0 4px">Total LTV: $${(v.ltv / 100).toLocaleString()}</p>
          ${Object.entries(v.segs).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`<div style="font-size:12px"><span style="display:inline-block;width:8px;height:8px;background:${SEGMENT_COLORS[s] ?? '#94a3b8'};margin-right:6px"></span>${s}: ${n}</div>`).join("")}
        </div>`);
      marker.addTo(layer);
    }
  }, [byState]);

  const toggle = (s: string) => {
    const next = new Set(selected);
    if (next.has(s)) next.delete(s); else next.add(s);
    setSelected(next);
  };

  const totals = useMemo(() => ({
    customers: filtered.length,
    ltv: filtered.reduce((s, r) => s + (r.lifetime_revenue_cents || 0), 0),
    states: byState.size,
  }), [filtered, byState]);

  return (
    <div className="relative" style={{ height: "100%" }}>
      <div className="relative z-[1000] p-4 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-foreground uppercase tracking-brand text-sm">Unified Customer Map</h2>
            <p className="text-xs text-muted-foreground">
              {loading ? "Loading cohorts…" : `${totals.customers.toLocaleString()} customers · $${(totals.ltv/100).toLocaleString()} LTV · ${totals.states} states`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground flex items-center gap-2">
              Min LTV $
              <input
                type="number" min={0} step={50} value={minLtv}
                onChange={(e) => setMinLtv(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 px-2 py-1 border border-border bg-background text-sm"
              />
            </label>
            <Button size="sm" variant={clubOnly ? "default" : "outline"} onClick={() => setClubOnly(c => !c)}>
              Club members only
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {SEGMENTS.map(s => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`text-xs px-2 py-1 border ${selected.has(s) ? "border-foreground" : "border-border opacity-40"}`}
              style={{ backgroundColor: selected.has(s) ? `${SEGMENT_COLORS[s]}22` : "transparent" }}
            >
              <span className="inline-block w-2 h-2 mr-1.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[s] }} />
              {s.replace("_", " ")}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(SEGMENTS))}>All</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
        </div>
      </div>
      {loading && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <div
        ref={mapContainerRef}
        className="relative z-0"
        style={{ height: "calc(100% - 130px)", width: "100%" }}
      />
    </div>
  );
}