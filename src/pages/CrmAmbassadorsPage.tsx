import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Users, AlertTriangle, Link2Off, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImpactHealthCard } from "@/components/admin/ImpactHealthCard";
import { AmbassadorPerformanceTable } from "@/components/crm/AmbassadorPerformanceTable";

function StatTile({ icon: Icon, label, value, sub, tone = "default" }: { icon: any; label: string; value: number | string; sub?: string; tone?: "default" | "warn" | "success" }) {
  const toneClass = tone === "warn" ? "border-destructive/40 bg-destructive/5" : tone === "success" ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card";
  return (
    <div className={`p-4 border ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-brand text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className="text-3xl font-bold mt-1 leading-none">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function CrmAmbassadorsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [recentRsvpCount, setRecentRsvpCount] = useState(0);
  const [healthFailures, setHealthFailures] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "active" | "all">("pending");

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data: profiles }, { data: evs }, { count: rsvpCount }, { count: failures }] = await Promise.all([
      supabase.from("ambassador_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("ambassador_events").select("id, title, slug, starts_at, status, host_user_id").gte("starts_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(8),
      supabase.from("ambassador_event_rsvps").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("impact_health_checks").select("id", { count: "exact", head: true }).neq("status", "ok").gte("checked_at", since24h),
    ]);
    setRows(profiles || []);
    setEvents(evs || []);
    setRecentRsvpCount(rsvpCount || 0);
    setHealthFailures(failures || 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("ambassador_profiles").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Status set to ${status}`);
    load();
  };

  const stats = useMemo(() => {
    const pending = rows.filter(r => r.status === "pending").length;
    const active = rows.filter(r => r.status === "active").length;
    const missingLink = rows.filter(r => r.status !== "terminated" && !r.impact_tracking_url).length;
    return { pending, active, missingLink };
  }, [rows]);

  const filtered = tab === "all" ? rows : rows.filter(r => r.status === tab);

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase">Ambassador Command Center</h1>
          <p className="text-sm text-muted-foreground">Approvals, link health, events, and program performance — all in one place.</p>
        </div>
      </div>

      {/* Rollup tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile icon={Clock} label="Pending approvals" value={stats.pending} tone={stats.pending > 0 ? "warn" : "default"} sub={stats.pending > 0 ? "Action required" : "All caught up"} />
        <StatTile icon={Link2Off} label="Missing impact link" value={stats.missingLink} tone={stats.missingLink > 0 ? "warn" : "default"} sub="Page held until provided" />
        <StatTile icon={AlertTriangle} label="Link failures (24h)" value={healthFailures} tone={healthFailures > 0 ? "warn" : "success"} sub="Auto-checked hourly" />
        <StatTile icon={CheckCircle2} label="Active ambassadors" value={stats.active} tone="success" sub="Live vanity pages" />
        <StatTile icon={Users} label="RSVPs (30d)" value={recentRsvpCount} sub={`${events.length} upcoming event${events.length === 1 ? "" : "s"}`} />
      </div>

      <ImpactHealthCard />

      <AmbassadorPerformanceTable />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-bold uppercase">Applications & Roster</h2>
        <div className="flex gap-2">
          {(["pending", "active", "all"] as const).map(t => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t} {t !== "all" && `(${rows.filter(r => r.status === t).length})`}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : filtered.length === 0 ? (
        <div className="text-center border border-dashed border-border py-12 px-6">
          <p className="text-sm font-medium text-foreground">No ambassadors in this view</p>
          <p className="text-xs text-muted-foreground mt-1">
            {tab === "pending" ? "New applications will appear here for approval." : tab === "active" ? "Approved ambassadors with a published vanity page will appear here." : "Once people sign up at /ambassador/signup they'll appear here."}
          </p>
        </div>
      ) : (
        <div className="border border-border divide-y divide-border">
          {filtered.map(r => (
            <div key={r.id} className="p-4 flex items-start gap-4 flex-wrap">
              {r.photo_url ? <img src={r.photo_url} className="w-16 h-16 object-cover" alt="" /> : <div className="w-16 h-16 bg-muted flex items-center justify-center font-bold">{r.display_name?.[0]}</div>}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold">{r.display_name}</span>
                  <Badge variant={r.status === "active" ? "default" : r.status === "pending" ? "secondary" : "outline"}>{r.status}</Badge>
                  <code className="text-xs bg-muted px-1.5">/a/{r.handle}</code>
                </div>
                {r.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.bio}</p>}
                <div className="text-xs text-muted-foreground mt-1">
                  {r.instagram && `IG ${r.instagram} · `}
                  {r.tiktok && `TikTok ${r.tiktok} · `}
                  {r.impact_tracking_url ? <span className="text-foreground">impact link ✓</span> : <span>no impact link yet</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {r.status === "active" && <Button asChild size="sm" variant="outline"><Link to={`/a/${r.handle}`} target="_blank">View <ExternalLink className="w-3 h-3 ml-1" /></Link></Button>}
                {r.status !== "active" && (
                  <Button
                    size="sm"
                    disabled={!r.impact_tracking_url}
                    title={!r.impact_tracking_url ? "Ambassador must add their impact.com tracking URL or code before going live" : undefined}
                    onClick={() => setStatus(r.id, "active")}
                  >
                    Approve & publish
                  </Button>
                )}
                {r.status !== "paused" && r.status !== "pending" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "paused")}>Pause</Button>}
                {r.status !== "pending" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "pending")}>Hold</Button>}
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("Terminate ambassador?")) setStatus(r.id, "terminated"); }}>Terminate</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming events */}
      <div>
        <h2 className="text-lg font-bold uppercase mb-3 flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Upcoming Events</h2>
        {events.length === 0 ? (
          <div className="text-center border border-dashed border-border py-8 px-6">
            <p className="text-sm text-muted-foreground">No upcoming ambassador-hosted events.</p>
          </div>
        ) : (
          <div className="border border-border divide-y divide-border">
            {events.map(e => (
              <div key={e.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-sm">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.starts_at).toLocaleString()} · <Badge variant="outline" className="ml-1">{e.status}</Badge></div>
                </div>
                <Button asChild size="sm" variant="outline"><Link to={`/events/${e.slug}`} target="_blank">View <ExternalLink className="w-3 h-3 ml-1" /></Link></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}