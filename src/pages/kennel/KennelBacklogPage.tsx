import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle2, AlertOctagon, UserCog, Copy, ChevronDown, ChevronRight, RefreshCw, Inbox } from "lucide-react";

type BacklogRow = {
  id: string;
  type: string;
  status: string;
  source: string | null;
  submitted_by: string | null;
  created_at: string;
  payload: Record<string, any>;
  workflow_status: "queued" | "in_progress" | "done" | "blocked" | "needs_blair" | "needs_lindy";
  owner: "lindy" | "lovable" | "blair" | "unassigned";
  workflow_note: string | null;
  workflow_updated_at: string | null;
};

const STATUS_TONE: Record<BacklogRow["workflow_status"], string> = {
  queued: "bg-muted text-foreground border-border",
  in_progress: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  done: "bg-green-500/15 text-green-700 border-green-500/40",
  blocked: "bg-destructive/15 text-destructive border-destructive/40",
  needs_blair: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  needs_lindy: "bg-purple-500/15 text-purple-700 border-purple-500/40",
};

const PRIO_RANK: Record<string, number> = { high: 0, urgent: 0, p0: 0, normal: 1, medium: 1, low: 2 };
const STATUSES: BacklogRow["workflow_status"][] = ["queued", "in_progress", "needs_blair", "needs_lindy", "blocked", "done"];

function pickTitle(p: any): string {
  return (p?.title || p?.text || p?.prompt || "(untitled)").toString().trim().slice(0, 160) || "(untitled)";
}
function pickBody(p: any): string {
  return (p?.prompt || p?.text || JSON.stringify(p, null, 2)).toString();
}
function pickPriority(p: any): string {
  return (p?.priority || "").toString().toLowerCase() || "—";
}
function pickArea(p: any): string {
  return (p?.area || "").toString().toLowerCase() || "—";
}

export default function KennelBacklogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | BacklogRow["workflow_status"]>("queued");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["kennel-backlog"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lindy_inbox")
        .select("id, type, status, source, submitted_by, created_at, payload, workflow_status, owner, workflow_note, workflow_updated_at")
        .eq("status", "approved")
        .neq("type", "slack_message")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BacklogRow[];
    },
  });

  const update = useMutation({
    mutationFn: async (args: { id: string; workflow_status?: string; owner?: string; note?: string }) => {
      const { error } = await supabase.rpc("update_backlog_item", {
        _id: args.id,
        _workflow_status: args.workflow_status ?? null,
        _owner: args.owner ?? null,
        _note: args.note ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kennel-backlog"] });
      toast({ title: "Updated" });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const areas = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(pickArea(r.payload)));
    return ["all", ...Array.from(s).filter((a) => a !== "—").sort(), "—"];
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    STATUSES.forEach((s) => (c[s] = 0));
    rows.forEach((r) => (c[r.workflow_status] = (c[r.workflow_status] ?? 0) + 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (statusFilter === "all" ? true : r.workflow_status === statusFilter))
      .filter((r) => (areaFilter === "all" ? true : pickArea(r.payload) === areaFilter))
      .filter((r) => {
        if (!q) return true;
        const blob = `${pickTitle(r.payload)} ${pickBody(r.payload)}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => {
        const pa = PRIO_RANK[pickPriority(a.payload)] ?? 3;
        const pb = PRIO_RANK[pickPriority(b.payload)] ?? 3;
        if (pa !== pb) return pa - pb;
        return a.created_at < b.created_at ? 1 : -1;
      });
  }, [rows, statusFilter, areaFilter, search]);

  const toggleOpen = (id: string) =>
    setOpenIds((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
        <Inbox className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold uppercase tracking-brand">Backlog</h1>
        <span className="text-xs text-muted-foreground">
          Live view of approved items from <code>lindy_inbox</code> · auto-refreshes every 30s
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto uppercase tracking-brand text-xs"
          style={{ borderRadius: 0 }}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Counts */}
      <div className="flex flex-wrap gap-1">
        {(["all", ...STATUSES] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s as any)}
            style={{ borderRadius: 0 }}
            className="text-xs uppercase tracking-brand"
          >
            {s.replace("_", " ")} ({counts[s] ?? 0})
          </Button>
        ))}
      </div>

      {/* Area + search */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="border border-border bg-background px-2 py-1.5 text-xs uppercase tracking-brand"
          style={{ borderRadius: 0 }}
        >
          {areas.map((a) => (
            <option key={a} value={a}>area: {a}</option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or body…"
          className="max-w-sm text-sm"
          style={{ borderRadius: 0 }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-20">No items match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const title = pickTitle(r.payload);
            const body = pickBody(r.payload);
            const open = openIds.has(r.id);
            const prio = pickPriority(r.payload);
            const area = pickArea(r.payload);
            return (
              <div key={r.id} className="border-2 border-border bg-card" style={{ borderRadius: 0 }}>
                <button
                  onClick={() => toggleOpen(r.id)}
                  className="w-full text-left p-3 flex items-start gap-3 hover:bg-muted/30"
                >
                  {open ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-brand ${
                          prio === "high" ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground"
                        }`}
                        style={{ borderRadius: 0 }}
                      >
                        {prio}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-brand" style={{ borderRadius: 0 }}>
                        {area}
                      </Badge>
                      <Badge
                        className={`text-[10px] uppercase tracking-brand border ${STATUS_TONE[r.workflow_status]}`}
                        style={{ borderRadius: 0 }}
                      >
                        {r.workflow_status.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-brand" style={{ borderRadius: 0 }}>
                        owner: {r.owner}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-foreground truncate">{title}</div>
                    {!open && body.length > 0 && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{body.slice(0, 220)}</div>
                    )}
                  </div>
                </button>

                {open && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border">
                    <pre className="text-xs bg-muted/40 p-3 overflow-auto max-h-72 border border-border whitespace-pre-wrap" style={{ borderRadius: 0 }}>
                      {body}
                    </pre>

                    {r.workflow_note && (
                      <div className="text-xs italic text-muted-foreground border-l-2 border-primary pl-2">
                        Last note: {r.workflow_note}
                      </div>
                    )}

                    <Textarea
                      placeholder="Note (optional) — explains the status change for Lindy/Blair"
                      value={noteDrafts[r.id] ?? ""}
                      onChange={(e) => setNoteDrafts((p) => ({ ...p, [r.id]: e.target.value }))}
                      rows={2}
                      style={{ borderRadius: 0 }}
                      className="text-xs"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => update.mutate({ id: r.id, workflow_status: "in_progress", note: noteDrafts[r.id] })}
                        disabled={update.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <Play className="h-3.5 w-3.5 mr-1" /> Start
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: r.id, workflow_status: "done", note: noteDrafts[r.id] })}
                        disabled={update.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Done
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: r.id, workflow_status: "blocked", note: noteDrafts[r.id] })}
                        disabled={update.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <AlertOctagon className="h-3.5 w-3.5 mr-1" /> Block
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: r.id, workflow_status: "needs_lindy", owner: "lindy", note: noteDrafts[r.id] })}
                        disabled={update.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <UserCog className="h-3.5 w-3.5 mr-1" /> Needs Lindy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: r.id, workflow_status: "needs_blair", owner: "blair", note: noteDrafts[r.id] })}
                        disabled={update.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <UserCog className="h-3.5 w-3.5 mr-1" /> Needs Blair
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(body);
                          toast({ title: "Prompt copied" });
                        }}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs ml-auto"
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy prompt
                      </Button>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      ID: <code>{r.id}</code>
                      {r.workflow_updated_at ? ` · updated ${new Date(r.workflow_updated_at).toLocaleString()}` : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}