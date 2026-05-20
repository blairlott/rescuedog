import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, CheckCircle2, AlertCircle, ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";

interface TierRow {
  id: string;
  name: string;
  slug: string;
  frequency: string;
  bottle_count: number;
  is_active: boolean;
  vinoshipper_club_id: string | null;
  vinoshipper_join_url: string | null;
  vinoshipper_last_synced_at: string | null;
}

export function ClubTiersAdmin() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [editing, setEditing] = useState<Record<string, { clubId: string; joinUrl: string }>>({});

  const { data: tiers, isLoading } = useQuery({
    queryKey: ["admin-wine-club-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_tiers")
        .select("id, name, slug, frequency, bottle_count, is_active, vinoshipper_club_id, vinoshipper_join_url, vinoshipper_last_synced_at")
        .order("sort_order");
      if (error) throw error;
      return data as TierRow[];
    },
  });

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("vinoshipper-sync-clubs", {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      toast.success(
        `Synced ${data.matched ?? 0} tier${data.matched === 1 ? "" : "s"} (${data.clubsFound ?? 0} clubs found in Vinoshipper)`
      );
      await qc.invalidateQueries({ queryKey: ["admin-wine-club-tiers"] });
      await qc.invalidateQueries({ queryKey: ["wine-club-tiers"] });
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const saveTier = async (tierId: string) => {
    const edit = editing[tierId];
    if (!edit) return;
    const { error } = await supabase
      .from("wine_club_tiers")
      .update({
        vinoshipper_club_id: edit.clubId || null,
        vinoshipper_join_url: edit.joinUrl || null,
      })
      .eq("id", tierId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    setEditing((prev) => {
      const next = { ...prev };
      delete next[tierId];
      return next;
    });
    qc.invalidateQueries({ queryKey: ["admin-wine-club-tiers"] });
    qc.invalidateQueries({ queryKey: ["wine-club-tiers"] });
  };

  const startEdit = (t: TierRow) =>
    setEditing((prev) => ({
      ...prev,
      [t.id]: {
        clubId: t.vinoshipper_club_id || "",
        joinUrl: t.vinoshipper_join_url || "",
      },
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-foreground">Vinoshipper Club Sync</h3>
          <p className="text-sm text-muted-foreground">
            Match each Wine Club tier to its Vinoshipper Club so card-on-file and recurring shipments work.
          </p>
        </div>
        <Button
          onClick={runSync}
          disabled={syncing}
          className="uppercase tracking-brand text-sm font-bold"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from Vinoshipper"}
        </Button>
      </div>

      {lastResult && (
        <div className="border border-border bg-muted/30 p-4 text-sm space-y-2">
          <p>
            <strong>{lastResult.matched}</strong> tier(s) matched from{" "}
            <strong>{lastResult.clubsFound}</strong> Vinoshipper club(s).
          </p>
          {lastResult.unmatchedTiers?.length > 0 && (
            <p className="text-muted-foreground">
              Unmatched tiers:{" "}
              {lastResult.unmatchedTiers.map((t: any) => t.name).join(", ")}
            </p>
          )}
          {lastResult.unmatchedClubs?.length > 0 && (
            <p className="text-muted-foreground">
              VS clubs with no tier match:{" "}
              {lastResult.unmatchedClubs.map((c: any) => `${c.name} (${c.id})`).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="border border-border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>VS Club ID</TableHead>
              <TableHead>Join URL</TableHead>
              <TableHead>Synced</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}>Loading...</TableCell></TableRow>
            ) : (tiers || []).map((t) => {
              const edit = editing[t.id];
              const linked = !!t.vinoshipper_club_id && !!t.vinoshipper_join_url;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.bottle_count} btl · {t.frequency}
                    </div>
                  </TableCell>
                  <TableCell>
                    {linked ? (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" /> Not linked
                      </Badge>
                    )}
                    {!t.is_active && (
                      <Badge variant="secondary" className="ml-1 text-xs">inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {edit ? (
                      <Input
                        value={edit.clubId}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, [t.id]: { ...p[t.id], clubId: e.target.value } }))
                        }
                        className="h-8 text-xs"
                        placeholder="VS club id"
                      />
                    ) : (
                      t.vinoshipper_club_id || "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[280px]">
                    {edit ? (
                      <Input
                        value={edit.joinUrl}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, [t.id]: { ...p[t.id], joinUrl: e.target.value } }))
                        }
                        className="h-8 text-xs"
                        placeholder="https://vinoshipper.com/..."
                      />
                    ) : t.vinoshipper_join_url ? (
                      <a
                        href={t.vinoshipper_join_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1 truncate"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{t.vinoshipper_join_url}</span>
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.vinoshipper_last_synced_at
                      ? new Date(t.vinoshipper_last_synced_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {edit ? (
                      <Button size="sm" onClick={() => saveTier(t.id)} className="text-xs">
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => startEdit(t)} className="text-xs">
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}