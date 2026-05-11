import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CrmAmbassadorsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "active" | "all">("pending");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ambassador_profiles").select("*").order("created_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("ambassador_profiles").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Status set to ${status}`);
    load();
  };

  const filtered = tab === "all" ? rows : rows.filter(r => r.status === tab);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold uppercase">Ambassadors</h1>
          <p className="text-sm text-muted-foreground">Approve, pause, or terminate Rescue Dog Wines ambassadors.</p>
        </div>
        <div className="flex gap-2">
          {(["pending", "active", "all"] as const).map(t => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>
              {t} {t !== "all" && `(${rows.filter(r => r.status === t).length})`}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center border border-dashed border-border">No ambassadors in this view.</p>
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
                {r.status !== "active" && <Button size="sm" onClick={() => setStatus(r.id, "active")}>Approve</Button>}
                {r.status !== "paused" && r.status !== "pending" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "paused")}>Pause</Button>}
                {r.status !== "pending" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "pending")}>Hold</Button>}
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("Terminate ambassador?")) setStatus(r.id, "terminated"); }}>Terminate</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}