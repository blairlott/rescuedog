import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  label?: string;
  invalidateKeys?: string[];
  className?: string;
}

export function RefreshButton({ label = "Refresh", invalidateKeys = ["kennel-dashboard"], className }: Props) {
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const qc = useQueryClient();

  const run = async () => {
    setBusy(true);
    try {
      toast.message("Refreshing data…", { description: "Pulling last 7 days from all channels" });
      const { data, error } = await supabase.functions.invoke("kennel-refresh-light", { body: { days: 7 } });
      if (error) throw error;
      const d = data as { ok_count: number; summary: { name: string; ok: boolean; error?: string }[] };
      const failed = d.summary.filter((s) => !s.ok);
      if (failed.length > 0) {
        toast.warning(`Refreshed with ${failed.length} failure(s)`, {
          description: failed.map((f) => f.name).join(", "),
        });
      } else {
        toast.success(`Refreshed ${d.ok_count} sources`);
      }
      setLastAt(Date.now());
      for (const k of invalidateKeys) await qc.invalidateQueries({ queryKey: [k] });
    } catch (e: any) {
      toast.error("Refresh failed", { description: e?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  };

  const ageLabel = (() => {
    if (!lastAt) return null;
    const mins = Math.round((Date.now() - lastAt) / 60000);
    return mins < 1 ? "just now" : `${mins}m ago`;
  })();

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Button
        size="sm"
        variant="default"
        onClick={run}
        disabled={busy}
        style={{ borderRadius: 0 }}
        className="uppercase tracking-brand text-xs"
      >
        <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing…" : label}
      </Button>
      {ageLabel && <span className="text-[10px] uppercase tracking-brand text-muted-foreground">Updated {ageLabel}</span>}
    </div>
  );
}