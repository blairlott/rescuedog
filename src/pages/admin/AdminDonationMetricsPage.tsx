import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";

interface DonationRow {
  id: string;
  metric_key: string;
  value_cents: number | null;
  value_display: string;
  partner_count: number | null;
  partner_count_override: number | null;
  as_of: string;
  source: string;
  qb_account_id: string | null;
  qb_account_name: string | null;
  error_log: string | null;
  last_successful_at: string | null;
}

interface RunResult {
  success: boolean;
  computed_value_cents: number | null;
  computed_value_display: string | null;
  vendor_count: number | null;
  qb_account: { id: string; name: string } | null;
  error: string | null;
  as_of: string;
}

export default function AdminDonationMetricsPage() {
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const [row, setRow] = useState<DonationRow | null>(null);
  const [loadingRow, setLoadingRow] = useState(true);
  const [running, setRunning] = useState(false);
  const [overrideValue, setOverrideValue] = useState<string>("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);

  const isAdmin = !!userRole?.isAdminOrOwner;

  async function loadRow() {
    setLoadingRow(true);
    const { data, error } = await supabase
      .from("donation_metrics")
      .select("*")
      .eq("metric_key", "lifetime_donations")
      .maybeSingle();
    setLoadingRow(false);
    if (error) {
      toast({ title: "Failed to load metric", description: error.message, variant: "destructive" });
      return;
    }
    setRow(data as DonationRow);
    setOverrideValue(
      data?.partner_count_override == null ? "" : String(data.partner_count_override),
    );
  }

  useEffect(() => {
    if (isAdmin) void loadRow();
  }, [isAdmin]);

  if (roleLoading) return <div className="p-8">Loading…</div>;
  if (!isAdmin) return <Navigate to="/admin" replace />;

  async function handleRunNow() {
    setRunning(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<RunResult>(
        "aggregate-donations",
        { body: {} },
      );
      if (error) throw error;
      setLastResult(data ?? null);
      if (data?.success) {
        toast({ title: "Updated successfully", description: data.computed_value_display ?? "" });
      } else {
        toast({
          title: "Aggregation failed; previous value retained",
          description: data?.error ?? "Unknown error",
          variant: "destructive",
        });
      }
      await loadRow();
    } catch (e: any) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  async function handleSaveOverride() {
    setSavingOverride(true);
    const parsed = overrideValue.trim() === "" ? null : parseInt(overrideValue, 10);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast({ title: "Invalid number", variant: "destructive" });
      setSavingOverride(false);
      return;
    }
    const { error } = await supabase
      .from("donation_metrics")
      .update({ partner_count_override: parsed })
      .eq("metric_key", "lifetime_donations");
    setSavingOverride(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Partner count override saved" });
    await loadRow();
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-bold uppercase tracking-brand mb-6">Donation Metrics</h1>

      {loadingRow ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !row ? (
        <p>No metric configured.</p>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 border border-border p-4 text-sm">
            <dt className="text-muted-foreground">Metric key</dt>
            <dd className="font-mono">{row.metric_key}</dd>

            <dt className="text-muted-foreground">Display value</dt>
            <dd className="font-bold text-lg">{row.value_display}</dd>

            <dt className="text-muted-foreground">Raw cents</dt>
            <dd className="font-mono">{row.value_cents ?? "—"}</dd>

            <dt className="text-muted-foreground">Partner count</dt>
            <dd>{row.partner_count ?? "—"}</dd>

            <dt className="text-muted-foreground">As of</dt>
            <dd>{new Date(row.as_of).toLocaleString()}</dd>

            <dt className="text-muted-foreground">Source</dt>
            <dd className="uppercase">{row.source}</dd>

            <dt className="text-muted-foreground">QB account</dt>
            <dd>
              {row.qb_account_name ? (
                <>
                  {row.qb_account_name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">({row.qb_account_id})</span>
                </>
              ) : (
                "—"
              )}
            </dd>

            <dt className="text-muted-foreground">Last successful pull</dt>
            <dd>{row.last_successful_at ? new Date(row.last_successful_at).toLocaleString() : "Never"}</dd>
          </dl>

          {row.error_log && (
            <div className="border border-destructive bg-destructive/10 text-destructive p-4 text-sm">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertTriangle className="h-4 w-4" /> Error log
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs">{row.error_log}</pre>
            </div>
          )}

          <div className="border border-border p-4 space-y-3">
            <Label htmlFor="override">Partner count override (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="override"
                type="number"
                min={0}
                placeholder="(blank = use QB vendor count)"
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                className="max-w-[240px]"
              />
              <Button onClick={handleSaveOverride} disabled={savingOverride} variant="outline" size="sm">
                {savingOverride && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              When set, the public site displays this number instead of the raw QuickBooks vendor count.
            </p>
          </div>

          <div>
            <Button onClick={handleRunNow} disabled={running} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Run Aggregation Now
            </Button>
          </div>

          {lastResult && (
            <div
              className={`border p-4 text-sm ${
                lastResult.success
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                  : "border-destructive bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-2">
                {lastResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {lastResult.success ? "Updated successfully" : "Aggregation failed; previous value retained"}
              </div>
              {lastResult.success ? (
                <ul className="space-y-1 font-mono text-xs">
                  <li>Value: {lastResult.computed_value_display} ({lastResult.computed_value_cents}¢)</li>
                  <li>Vendor count: {lastResult.vendor_count}</li>
                  <li>
                    QB account: {lastResult.qb_account?.name} ({lastResult.qb_account?.id})
                  </li>
                  <li>As of: {lastResult.as_of}</li>
                </ul>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs">{lastResult.error}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}