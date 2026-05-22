import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, RefreshCw, Upload, Save } from "lucide-react";

type Score = { email: string; score: number; scored_at: string };
type UploadRow = {
  upload_id: string;
  platform: string;
  list_name: string;
  email_count: number;
  upload_at: string;
  status: string;
  error_message: string | null;
};
type Segment = {
  segment_id: string;
  segment_name: string;
  tier: number;
  rdw_mapping: string;
  platform_ids: Record<string, string> | null;
  updated_at: string;
};

const CmsAudiencesPage = () => {
  const { isCmsEditor, loading } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isCmsEditor) navigate("/cms/login");
  }, [loading, isCmsEditor, navigate]);

  const [running, setRunning] = useState<string | null>(null);

  const { data: scores = [] } = useQuery({
    queryKey: ["kennel_lookalike_scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_lookalike_scores")
        .select("email,score,scored_at")
        .order("score", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as Score[];
    },
  });

  const { data: uploads = [] } = useQuery({
    queryKey: ["kennel_audience_uploads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_audience_uploads")
        .select("upload_id,platform,list_name,email_count,upload_at,status,error_message")
        .order("upload_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as UploadRow[];
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: ["kennel_iab_segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_iab_segments")
        .select("segment_id,segment_name,tier,rdw_mapping,platform_ids,updated_at")
        .order("segment_id");
      if (error) throw error;
      return (data ?? []) as Segment[];
    },
  });

  const stats = useMemo(() => {
    const n = scores.length;
    if (!n) return { n: 0, top20: 0, median: 0, last: null as string | null };
    const sorted = [...scores].map((s) => s.score).sort((a, b) => a - b);
    const median = sorted[Math.floor(n / 2)];
    const top20 = Math.floor(n * 0.2);
    const last = scores.reduce((acc, s) => (s.scored_at > acc ? s.scored_at : acc), scores[0].scored_at);
    return { n, top20, median, last };
  }, [scores]);

  const histogram = useMemo(() => {
    const buckets = Array(10).fill(0);
    for (const s of scores) {
      const idx = Math.min(9, Math.max(0, Math.floor(s.score * 10)));
      buckets[idx]++;
    }
    const max = Math.max(1, ...buckets);
    return { buckets, max };
  }, [scores]);

  const trigger = async (fn: string, label: string, body: Record<string, unknown> = {}) => {
    setRunning(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      toast({ title: `${label} started`, description: typeof data === "object" ? JSON.stringify(data).slice(0, 200) : String(data) });
      qc.invalidateQueries({ queryKey: ["kennel_audience_uploads"] });
      qc.invalidateQueries({ queryKey: ["kennel_lookalike_scores"] });
    } catch (e) {
      toast({ title: `${label} failed`, description: (e as Error).message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  };

  const [edits, setEdits] = useState<Record<string, { rdw_mapping: string; platform_ids: string }>>({});
  const startEdit = (s: Segment) => {
    setEdits((p) => ({
      ...p,
      [s.segment_id]: {
        rdw_mapping: s.rdw_mapping,
        platform_ids: JSON.stringify(s.platform_ids ?? {}, null, 0),
      },
    }));
  };
  const saveEdit = async (id: string) => {
    const e = edits[id];
    if (!e) return;
    let parsed: unknown = {};
    try { parsed = JSON.parse(e.platform_ids || "{}"); }
    catch { toast({ title: "Invalid JSON", description: "platform_ids must be valid JSON", variant: "destructive" }); return; }
    const { error } = await supabase
      .from("kennel_iab_segments")
      .update({ rdw_mapping: e.rdw_mapping, platform_ids: parsed as any })
      .eq("segment_id", id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved" });
    setEdits((p) => { const n = { ...p }; delete n[id]; return n; });
    qc.invalidateQueries({ queryKey: ["kennel_iab_segments"] });
  };

  if (loading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/cms" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to CMS
            </Link>
            <h1 className="text-3xl font-bold">Audience Intelligence</h1>
            <p className="text-muted-foreground">Lookalike scoring, audience uploads, IAB segment mapping.</p>
          </div>
        </div>

        {/* Quick actions */}
        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => trigger("kennel-lookalike-score", "Lookalike scorer")} disabled={!!running}>
              {running === "kennel-lookalike-score" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Run lookalike scorer now
            </Button>
            <Button onClick={() => trigger("kennel-google-customer-match", "Google Customer Match")} disabled={!!running} variant="secondary">
              {running === "kennel-google-customer-match" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload to Google Customer Match
            </Button>
            <Button onClick={() => trigger("meta-audience-sync", "Meta audience sync", { cadence: "monthly" })} disabled={!!running} variant="secondary">
              {running === "meta-audience-sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload to Meta now
            </Button>
          </CardContent>
        </Card>

        {/* Lookalike distribution */}
        <Card>
          <CardHeader><CardTitle>Lookalike score distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <Stat label="Total scored" value={stats.n.toLocaleString()} />
              <Stat label="Top 20%" value={stats.top20.toLocaleString()} />
              <Stat label="Median score" value={stats.median.toFixed(3)} />
              <Stat label="Last scored" value={stats.last ? new Date(stats.last).toLocaleString() : "—"} />
            </div>
            <div className="flex items-end gap-1 h-32">
              {histogram.buckets.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="w-full bg-primary/80" style={{ height: `${(c / histogram.max) * 100}%` }} title={`${(i / 10).toFixed(1)}–${((i + 1) / 10).toFixed(1)}: ${c}`} />
                  <div className="text-[10px] text-muted-foreground mt-1">{(i / 10).toFixed(1)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upload log */}
        <Card>
          <CardHeader><CardTitle>Audience upload log</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">When</th><th className="p-2">Platform</th><th className="p-2">List</th>
                    <th className="p-2 text-right">Emails</th><th className="p-2">Status</th><th className="p-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.upload_id} className="border-b">
                      <td className="p-2">{new Date(u.upload_at).toLocaleString()}</td>
                      <td className="p-2">{u.platform}</td>
                      <td className="p-2">{u.list_name}</td>
                      <td className="p-2 text-right">{u.email_count.toLocaleString()}</td>
                      <td className="p-2">
                        <Badge variant={u.status === "success" ? "default" : u.status === "failed" ? "destructive" : "secondary"}>{u.status}</Badge>
                      </td>
                      <td className="p-2 text-xs text-muted-foreground max-w-md truncate">{u.error_message ?? ""}</td>
                    </tr>
                  ))}
                  {!uploads.length && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No uploads yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* IAB segments */}
        <Card>
          <CardHeader><CardTitle>IAB segment map</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">IAB ID</th><th className="p-2">Name</th><th className="p-2">Tier</th>
                    <th className="p-2">RDW mapping</th><th className="p-2">Platform IDs (JSON)</th><th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s) => {
                    const e = edits[s.segment_id];
                    return (
                      <tr key={s.segment_id} className="border-b">
                        <td className="p-2 font-mono">{s.segment_id}</td>
                        <td className="p-2">{s.segment_name}</td>
                        <td className="p-2">{s.tier}</td>
                        <td className="p-2">
                          {e ? (
                            <Input value={e.rdw_mapping} onChange={(ev) => setEdits((p) => ({ ...p, [s.segment_id]: { ...e, rdw_mapping: ev.target.value } }))} className="h-8" />
                          ) : s.rdw_mapping}
                        </td>
                        <td className="p-2 max-w-md">
                          {e ? (
                            <Input value={e.platform_ids} onChange={(ev) => setEdits((p) => ({ ...p, [s.segment_id]: { ...e, platform_ids: ev.target.value } }))} className="h-8 font-mono text-xs" />
                          ) : <code className="text-xs">{JSON.stringify(s.platform_ids ?? {})}</code>}
                        </td>
                        <td className="p-2">
                          {e ? (
                            <Button size="sm" onClick={() => saveEdit(s.segment_id)}><Save className="h-3 w-3 mr-1" />Save</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>Edit</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-xl font-semibold">{value}</div>
  </div>
);

export default CmsAudiencesPage;