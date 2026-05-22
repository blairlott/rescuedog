import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Inbox, Check, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type FeatureRequest = {
  id: string;
  user_email: string | null;
  user_name: string | null;
  area: string | null;
  request: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

const STATUS_OPTIONS = ["new", "in_review", "planned", "done", "rejected"];

export function FeatureRequestInbox() {
  const { toast } = useToast();
  const [rows, setRows] = useState<FeatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("feature_requests")
      .select("id,user_email,user_name,area,request,status,admin_notes,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast({ title: "Failed to load requests", description: error.message, variant: "destructive" });
    setRows((data as FeatureRequest[] | null) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("feature_requests").update({ status }).eq("id", id);
    if (error) return toast({ title: "Update failed", description: error.message, variant: "destructive" });
    setRows((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
  };

  const updateNotes = async (id: string, admin_notes: string) => {
    const { error } = await supabase.from("feature_requests").update({ admin_notes }).eq("id", id);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    setRows((r) => r.map((x) => (x.id === id ? { ...x, admin_notes } : x)));
    toast({ title: "Notes saved" });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this request?")) return;
    const { error } = await supabase.from("feature_requests").delete().eq("id", id);
    if (error) return toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    setRows((r) => r.filter((x) => x.id !== id));
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div className="border border-border bg-background">
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-foreground">Feature Request Inbox</h3>
          {newCount > 0 && (
            <span className="text-xs font-bold bg-primary text-primary-foreground px-2 py-0.5">
              {newCount} new
            </span>
          )}
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-input bg-background text-sm px-2 py-1"
        >
          <option value="all">All ({rows.length})</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">No requests in this view.</div>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((r) => {
            const isOpen = openId === r.id;
            return (
              <li key={r.id} className="p-4">
                <button
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                  className="w-full text-left flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className="font-bold text-foreground">{r.user_name || r.user_email || "Unknown"}</span>
                      {r.area && <span>· {r.area}</span>}
                      <span>· {new Date(r.created_at).toLocaleString()}</span>
                      <span className="ml-auto uppercase tracking-brand text-[10px] font-bold bg-muted px-2 py-0.5">
                        {r.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className={`text-sm text-foreground ${isOpen ? "" : "line-clamp-2"}`}>
                      {r.request}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-1" />}
                </button>

                {isOpen && (
                  <div className="mt-3 pl-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-brand text-muted-foreground">Status:</span>
                      {STATUS_OPTIONS.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={r.status === s ? "default" : "outline"}
                          onClick={() => updateStatus(r.id, s)}
                        >
                          {s.replace("_", " ")}
                        </Button>
                      ))}
                    </div>
                    <NotesEditor
                      initial={r.admin_notes || ""}
                      onSave={(v) => updateNotes(r.id, v)}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NotesEditor({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initial);
  return (
    <div>
      <label className="text-xs uppercase tracking-brand text-muted-foreground">Owner notes</label>
      <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={3} className="mt-1" />
      <Button size="sm" className="mt-2" onClick={() => onSave(val)} disabled={val === initial}>
        <Check className="h-4 w-4 mr-1" /> Save notes
      </Button>
    </div>
  );
}