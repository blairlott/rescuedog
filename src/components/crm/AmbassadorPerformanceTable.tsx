import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Profile = { id: string; user_id: string; handle: string; display_name: string };
type Row = {
  profile: Profile;
  events: number;
  bottles: number;
  donation_cents: number;
};

export function AmbassadorPerformanceTable() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [eventsByUser, setEventsByUser] = useState<Record<string, { events: number; bottles: number; donation: number }>>({});
  const [windowDays, setWindowDays] = useState<30 | 90 | 365>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 86400 * 1000).toISOString();
      const [{ data: profs }, { data: ev }] = await Promise.all([
        supabase.from("ambassador_profiles").select("id,user_id,handle,display_name").neq("status", "terminated"),
        supabase.from("impact_events").select("user_id,bottles,donation_cents").gte("occurred_at", since).not("user_id", "is", null),
      ]);
      setProfiles((profs as any) ?? []);
      const agg: Record<string, { events: number; bottles: number; donation: number }> = {};
      (ev ?? []).forEach((r: any) => {
        const k = r.user_id; if (!k) return;
        agg[k] = agg[k] ?? { events: 0, bottles: 0, donation: 0 };
        agg[k].events += 1;
        agg[k].bottles += r.bottles || 0;
        agg[k].donation += r.donation_cents || 0;
      });
      setEventsByUser(agg);
      setLoading(false);
    })();
  }, [windowDays]);

  const rows: Row[] = useMemo(() => profiles.map(p => {
    const a = eventsByUser[p.user_id] ?? { events: 0, bottles: 0, donation: 0 };
    return { profile: p, events: a.events, bottles: a.bottles, donation_cents: a.donation };
  }).sort((a, b) => b.donation_cents - a.donation_cents), [profiles, eventsByUser]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    events: acc.events + r.events,
    bottles: acc.bottles + r.bottles,
    donation: acc.donation + r.donation_cents,
  }), { events: 0, bottles: 0, donation: 0 }), [rows]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <h2 className="text-lg font-bold uppercase">Performance</h2>
        <div className="flex gap-2">
          {[30, 90, 365].map(d => (
            <Button key={d} size="sm" variant={windowDays === d ? "default" : "outline"} onClick={() => setWindowDays(d as any)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs uppercase tracking-brand">
              <tr>
                <th className="text-left p-2">Ambassador</th>
                <th className="text-right p-2">Attributed orders</th>
                <th className="text-right p-2">Bottles</th>
                <th className="text-right p-2">Rescue donation</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">
                  No impact attribution yet. Conversions land here once impact.com posts back to <code>impact_events</code>.
                </td></tr>
              ) : rows.map(r => (
                <tr key={r.profile.id} className="border-t border-border">
                  <td className="p-2">
                    <div className="font-medium">{r.profile.display_name}</div>
                    <code className="text-xs text-muted-foreground">/a/{r.profile.handle}</code>
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.events}</td>
                  <td className="p-2 text-right tabular-nums">{r.bottles}</td>
                  <td className="p-2 text-right tabular-nums">${(r.donation_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className="p-2">Total ({windowDays}d)</td>
                <td className="p-2 text-right tabular-nums">{totals.events}</td>
                <td className="p-2 text-right tabular-nums">{totals.bottles}</td>
                <td className="p-2 text-right tabular-nums">${(totals.donation / 100).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}