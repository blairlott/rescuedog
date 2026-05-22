import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle, Loader2, ExternalLink, Inbox, Undo2 } from "lucide-react";

type Draft = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  source_url: string | null;
  confidence: "low" | "medium" | "high" | null;
  status: "pending" | "approved" | "rejected" | "promoted" | "error" | "pushed_back";
  submitted_by: string | null;
  reviewer_notes: string | null;
  promoted_ref: string | null;
  error_message: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_COLORS: Record<Draft["status"], string> = {
  pending: "bg-yellow-500/15 text-yellow-700 border-yellow-500/40",
  approved: "bg-blue-500/15 text-blue-700 border-blue-500/40",
  promoted: "bg-green-500/15 text-green-700 border-green-500/40",
  rejected: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/40",
  pushed_back: "bg-orange-500/15 text-orange-700 border-orange-500/40",
};

export default function CmsLindyInboxPage() {
  const { isCmsEditor, loading } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Draft["status"] | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!loading && !isCmsEditor) { navigate("/cms/login"); return null; }

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["lindy-inbox", filter],
    queryFn: async () => {
      let q = supabase.from("lindy_inbox").select("*").order("created_at", { ascending: false }).limit(200);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Draft[];
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { data: { user: u } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("lindy_inbox")
        .update({
          status,
          reviewer_id: u?.id ?? null,
          reviewer_notes: notes[id] ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast({ title: `Draft ${vars.status}` });
      qc.invalidateQueries({ queryKey: ["lindy-inbox"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pushback = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const note = (notes[id] ?? "").trim();
      if (!note) throw new Error("Add a note explaining what Lindy should fix.");
      const { data, error } = await supabase.functions.invoke("lindy-pushback", {
        body: { draft_id: id, note },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast({ title: "Pushed back to Lindy", description: "Email sent to blair.lott@rescuedogwines.com" });
      qc.invalidateQueries({ queryKey: ["lindy-inbox"] });
    },
    onError: (e: Error) => toast({ title: "Pushback failed", description: e.message, variant: "destructive" }),
  });

  const counts = drafts.reduce((acc, d) => { acc[d.status] = (acc[d.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="min-h-dvh bg-background">
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild style={{ borderRadius: 0 }}>
              <Link to="/cms"><ArrowLeft className="h-4 w-4 mr-1" /> CMS</Link>
            </Button>
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold uppercase tracking-brand">Lindy Inbox</h1>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["pending", "approved", "pushed_back", "rejected", "promoted", "all"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={filter === s ? "default" : "outline"}
                onClick={() => setFilter(s)}
                style={{ borderRadius: 0 }}
                className="text-xs uppercase tracking-brand"
              >
                {s} {s !== "all" && counts[s] ? `(${counts[s]})` : ""}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : drafts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">No drafts in {filter}.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="border-2 border-border bg-card p-4" style={{ borderRadius: 0 }}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="uppercase tracking-brand text-[10px]" style={{ borderRadius: 0 }}>
                    {d.type}
                  </Badge>
                  <Badge className={`uppercase tracking-brand text-[10px] border ${STATUS_COLORS[d.status]}`} style={{ borderRadius: 0 }}>
                    {d.status}
                  </Badge>
                  {d.confidence && (
                    <Badge variant="outline" className="uppercase tracking-brand text-[10px]" style={{ borderRadius: 0 }}>
                      conf: {d.confidence}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(d.created_at).toLocaleString()}
                    {d.submitted_by ? ` · ${d.submitted_by}` : ""}
                  </span>
                </div>

                <pre className="text-xs bg-muted/50 p-3 overflow-auto max-h-72 border border-border" style={{ borderRadius: 0 }}>
                  {JSON.stringify(d.payload, null, 2)}
                </pre>

                {d.source_url && (
                  <a href={d.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-2 hover:underline">
                    Source <ExternalLink className="h-3 w-3" />
                  </a>
                )}

                {d.reviewer_notes && (
                  <p className="text-xs text-muted-foreground mt-2 italic">Notes: {d.reviewer_notes}</p>
                )}
                {d.error_message && (
                  <p className="text-xs text-destructive mt-2">Error: {d.error_message}</p>
                )}

                {d.status === "pending" && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      placeholder="Reviewer notes (optional)"
                      value={notes[d.id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [d.id]: e.target.value }))}
                      className="text-sm"
                      style={{ borderRadius: 0 }}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => review.mutate({ id: d.id, status: "approved" })}
                        disabled={review.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => review.mutate({ id: d.id, status: "rejected" })}
                        disabled={review.isPending}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs"
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pushback.mutate({ id: d.id })}
                        disabled={pushback.isPending || !(notes[d.id] ?? "").trim()}
                        style={{ borderRadius: 0 }}
                        className="uppercase tracking-brand text-xs border-orange-500/60 text-orange-700 hover:bg-orange-500/10"
                        title={(notes[d.id] ?? "").trim() ? "Send back to Lindy via email" : "Add a note first"}
                      >
                        <Undo2 className="h-4 w-4 mr-1" /> Push back to Lindy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}