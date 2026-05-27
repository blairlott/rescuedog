import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Play, Link2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

interface RunRow {
  id: string;
  kind: string;
  status: string;
  cursor: string | null;
  total_seen: number;
  total_linked: number;
  total_skipped: number;
  total_errors: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

interface Counts {
  total_profiles: number;
  linked_profiles: number;
  total_legacy_memberships: number;
  claimed_legacy_memberships: number;
}

export default function CrmLegacyMigrationPage() {
  const { data: roleInfo, isLoading: roleLoading } = useUserRole();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [startPage, setStartPage] = useState(1);
  const [maxPages, setMaxPages] = useState(10);
  const [pageSize, setPageSize] = useState(100);
  const [dryRun, setDryRun] = useState(true);
  const [relinkEmail, setRelinkEmail] = useState("");
  const [relinkVsId, setRelinkVsId] = useState("");

  const isAdmin = roleInfo?.roles.some((r) => r === "owner" || r === "admin");

  const loadAll = async () => {
    setLoading(true);
    const [{ count: totalProfiles }, { count: linkedProfiles }, { count: totalLegacy }, { count: claimedLegacy }, { data: runRows }] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).not("vinoshipper_customer_id", "is", null),
      supabase.from("wine_club_memberships").select("id", { count: "exact", head: true }).eq("origin", "vinoshipper_legacy"),
      supabase.from("wine_club_memberships").select("id", { count: "exact", head: true }).eq("origin", "vinoshipper_legacy").not("claimed_at", "is", null),
      supabase.from("vinoshipper_backfill_runs").select("*").order("started_at", { ascending: false }).limit(20),
    ]);
    setCounts({
      total_profiles: totalProfiles ?? 0,
      linked_profiles: linkedProfiles ?? 0,
      total_legacy_memberships: totalLegacy ?? 0,
      claimed_legacy_memberships: claimedLegacy ?? 0,
    });
    setRuns((runRows ?? []) as RunRow[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const runBackfill = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinoshipper-backfill-customers", {
        body: { start_page: startPage, max_pages: maxPages, page_size: pageSize, dry_run: dryRun },
      });
      if (error) throw error;
      toast.success(
        `${dryRun ? "Dry run" : "Backfill"} complete · seen ${data.seen} · linked ${data.linked} · skipped ${data.skipped} · errors ${data.errors}`,
      );
      await loadAll();
    } catch (err: any) {
      toast.error(err.message ?? "Backfill failed");
    } finally {
      setRunning(false);
    }
  };

  const manualRelink = async () => {
    const email = relinkEmail.trim().toLowerCase();
    const vsId = relinkVsId.trim();
    if (!email || !vsId) { toast.error("Email and Vinoshipper ID are both required"); return; }
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, vinoshipper_customer_id, email")
      .ilike("email", email)
      .maybeSingle();
    if (pErr) { toast.error(pErr.message); return; }
    if (!profile) { toast.error("No account with that email — customer must sign up first"); return; }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ vinoshipper_customer_id: vsId })
      .eq("id", profile.id);
    if (updErr) { toast.error(updErr.message); return; }
    toast.success(`Linked ${profile.email} → VS ${vsId}`);
    setRelinkEmail(""); setRelinkVsId("");
    await loadAll();
  };

  if (roleLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (!isAdmin) return <div className="p-8 text-sm text-muted-foreground">Admin or owner role required.</div>;

  return (
    <>
      <Seo noindex title="Crm Legacy Migration" />
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Legacy Vinoshipper Migration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Backfill links existing Vinoshipper customers to Lovable accounts (by email). Run this in batches; it is idempotent.
        </p>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading || !counts ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></CardContent></Card>
        )) : (
          <>
            <Stat label="Total accounts" value={counts.total_profiles} />
            <Stat label="Linked to Vinoshipper" value={counts.linked_profiles} />
            <Stat label="Legacy memberships" value={counts.total_legacy_memberships} />
            <Stat label="Claimed" value={counts.claimed_legacy_memberships} />
          </>
        )}
      </div>

      {/* Backfill control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Run backfill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="startPage">Start page</Label>
              <Input id="startPage" type="number" min={1} value={startPage} onChange={(e) => setStartPage(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label htmlFor="maxPages">Max pages</Label>
              <Input id="maxPages" type="number" min={1} max={50} value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <Label htmlFor="pageSize">Page size</Label>
              <Input id="pageSize" type="number" min={1} max={200} value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value) || 100)} />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (no writes)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={runBackfill} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {dryRun ? "Dry run" : "Run backfill"}
            </Button>
            <Button variant="outline" onClick={loadAll} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: always dry-run first. Each "run" processes <strong>max_pages × page_size</strong> Vinoshipper customers,
            then you advance <em>Start page</em> to <em>next_page</em> from the last run.
          </p>
        </CardContent>
      </Card>

      {/* Manual re-link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Manual re-link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            For accounts whose email in Lovable doesn't match their Vinoshipper email (e.g. typos, alias addresses).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2">
            <Input placeholder="customer@example.com" value={relinkEmail} onChange={(e) => setRelinkEmail(e.target.value)} />
            <Input placeholder="Vinoshipper customer ID" value={relinkVsId} onChange={(e) => setRelinkVsId(e.target.value)} />
            <Button onClick={manualRelink}>Link</Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                  <TableHead className="text-right">Linked</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead>Next page</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.kind}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "default" : r.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">
                        {r.status === "completed" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : r.status === "failed" ? <AlertTriangle className="h-3 w-3 mr-1" /> : <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.total_seen}</TableCell>
                    <TableCell className="text-right text-xs font-bold text-primary">{r.total_linked}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{r.total_skipped}</TableCell>
                    <TableCell className="text-right text-xs">{r.total_errors > 0 ? <span className="text-destructive">{r.total_errors}</span> : 0}</TableCell>
                    <TableCell className="text-xs">{r.cursor ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <>
      <Seo noindex title="Crm Legacy Migration" />
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-brand text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold text-foreground mt-1">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
    </>
  );
}