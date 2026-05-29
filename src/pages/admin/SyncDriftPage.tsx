import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

interface DriftRow {
  id: string;
  field: string;
  old_value: any;
  new_value: any;
  source: string | null;
  created_at: string;
  wine_product_id: string;
  product_title: string | null;
  product_handle: string | null;
  image_url: string | null;
}

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function fmtValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}

export default function SyncDriftPage() {
  const [rows, setRows] = useState<DriftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "approve" | "reject"; ids: string[]; label: string }
    | null
  >(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("wine_products_pending")
      .select(
        "id, field, old_value, new_value, source, created_at, wine_product_id, wine_products!inner(id, title, handle, image_url)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows(
        (data || []).map((r: any) => ({
          id: r.id,
          field: r.field,
          old_value: r.old_value,
          new_value: r.new_value,
          source: r.source,
          created_at: r.created_at,
          wine_product_id: r.wine_product_id,
          product_title: r.wine_products?.title ?? null,
          product_handle: r.wine_products?.handle ?? null,
          image_url: r.wine_products?.image_url ?? null,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Group "runs" = same source within a 5-min window of the newest row.
  const runGroups = useMemo(() => {
    const groups: { key: string; source: string; ids: string[]; newest: string }[] = [];
    const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const r of sorted) {
      const src = r.source || "unknown";
      const found = groups.find(
        (g) =>
          g.source === src &&
          Math.abs(new Date(g.newest).getTime() - new Date(r.created_at).getTime()) <=
            5 * 60 * 1000
      );
      if (found) found.ids.push(r.id);
      else groups.push({ key: src + r.created_at, source: src, ids: [r.id], newest: r.created_at });
    }
    return groups;
  }, [rows]);

  const runApprove = async (ids: string[]) => {
    setBusy(ids[0] || "bulk");
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc("approve_wine_drift", { _pending_id: id });
      if (error) fail++;
      else ok++;
    }
    setBusy(null);
    if (fail === 0) toast.success(`Approved ${ok} change${ok === 1 ? "" : "s"}`);
    else toast.error(`Approved ${ok}, failed ${fail}`);
    await load();
  };

  const runReject = async (ids: string[]) => {
    setBusy(ids[0] || "bulk");
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const { error } = await supabase.rpc("reject_wine_drift", { _pending_id: id });
      if (error) fail++;
      else ok++;
    }
    setBusy(null);
    if (fail === 0) toast.success(`Rejected ${ok} change${ok === 1 ? "" : "s"}`);
    else toast.error(`Rejected ${ok}, failed ${fail}`);
    await load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
      <Seo noindex title="Catalog Sync Drift" />
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catalog Sync Drift</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Review proposed changes from Vinoshipper that conflict with CMS-locked fields.
            Approving applies the change and re-locks the field; rejecting keeps the current value.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drift…
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border bg-card p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <h2 className="font-semibold">No drift to review.</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Catalog sync is currently in sync with Vinoshipper for all locked fields.
          </p>
        </div>
      ) : (
        <>
          {runGroups.length > 0 && (
            <div className="border border-border bg-muted/30 p-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="font-medium">{rows.length}</span> pending changes across{" "}
                <span className="font-medium">{runGroups.length}</span> sync run
                {runGroups.length === 1 ? "" : "s"}.
              </div>
              <div className="flex gap-2 flex-wrap">
                {runGroups.map((g) => (
                  <Button
                    key={g.key}
                    size="sm"
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        kind: "approve",
                        ids: g.ids,
                        label: `Approve all ${g.ids.length} change${g.ids.length === 1 ? "" : "s"} from "${g.source}" (${relTime(g.newest)})?`,
                      })
                    }
                  >
                    Approve run · {g.source} ({g.ids.length})
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        {r.image_url ? (
                          <img
                            src={r.image_url}
                            alt=""
                            className="w-10 h-10 object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-muted shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {r.product_title || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.product_handle}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.field}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="text-xs text-muted-foreground line-through">
                        {fmtValue(r.old_value)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div className="text-xs font-medium">{fmtValue(r.new_value)}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.source || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relTime(r.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={busy === r.id}
                          onClick={() =>
                            setConfirm({
                              kind: "approve",
                              ids: [r.id],
                              label: `Apply ${r.field} change to "${r.product_title}"? The field will be re-locked under your account.`,
                            })
                          }
                        >
                          {busy === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() =>
                            setConfirm({
                              kind: "reject",
                              ids: [r.id],
                              label: `Reject this ${r.field} change for "${r.product_title}"? The current value stays locked.`,
                            })
                          }
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "approve" ? "Approve change" : "Reject change"}
              {confirm && confirm.ids.length > 1 ? `s (${confirm.ids.length})` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm?.label}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                const { kind, ids } = confirm;
                setConfirm(null);
                if (kind === "approve") runApprove(ids);
                else runReject(ids);
              }}
            >
              {confirm?.kind === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}