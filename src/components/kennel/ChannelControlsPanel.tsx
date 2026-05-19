import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sliders, Save, RotateCcw, Zap } from "lucide-react";
import type { ChannelRow } from "./ChannelPerformanceTable";

interface Props {
  rows: ChannelRow[];
}

type ChannelControl = {
  spend_pct: number;     // 50-200, default 100
  auto_apply: boolean;
  updated_at?: string;
};

const DEFAULT_CONTROL: ChannelControl = { spend_pct: 100, auto_apply: true };
const SHARP = { borderRadius: 0 } as const;

function keyFor(channelId: string) {
  return `channel_controls_${channelId}`;
}

export function ChannelControlsPanel({ rows }: Props) {
  if (rows.length === 0) return null;
  return (
    <section className="border-2 border-foreground p-4" style={SHARP}>
      <header className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">
            Channel controls
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Spend faders, auto-apply, and one-click recommendation approval per channel.
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((r) => (
          <ChannelCard key={r.channel_id} row={r} />
        ))}
      </div>
    </section>
  );
}

function ChannelCard({ row }: { row: ChannelRow }) {
  const qc = useQueryClient();
  const settingsKey = keyFor(row.channel_id);
  const [draft, setDraft] = useState<ChannelControl>(DEFAULT_CONTROL);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data: loaded } = useQuery({
    queryKey: ["channel-control", settingsKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_settings" as any)
        .select("value, updated_at")
        .eq("key", settingsKey)
        .maybeSingle();
      const value = (data as any)?.value as Partial<ChannelControl> | undefined;
      return { ...DEFAULT_CONTROL, ...(value ?? {}), updated_at: (data as any)?.updated_at } as ChannelControl;
    },
  });

  const { data: pendingCount = 0, refetch: refetchPending } = useQuery({
    queryKey: ["channel-pending-recs", row.channel_id],
    queryFn: async () => {
      const { count } = await supabase
        .from("ad_recommendations" as any)
        .select("id", { count: "exact", head: true })
        .eq("channel_id", row.channel_id)
        .eq("status", "pending");
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (loaded) {
      setDraft({ ...loaded });
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.updated_at]);

  const projectedSpend = useMemo(() => Math.round((row.spend * draft.spend_pct) / 100), [row.spend, draft.spend_pct]);
  const projectedDelta = projectedSpend - Math.round(row.spend);

  const update = (patch: Partial<ChannelControl>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const value = {
        spend_pct: draft.spend_pct,
        auto_apply: draft.auto_apply,
        channel_id: row.channel_id,
        platform: row.platform,
      };
      const { error } = await supabase
        .from("ad_settings" as any)
        .upsert({ key: settingsKey, value }, { onConflict: "key" });
      if (error) throw error;
      toast.success(`${row.name} controls saved`, { description: "Optimizer will use it on the next run." });
      await qc.invalidateQueries({ queryKey: ["channel-control", settingsKey] });
      setDirty(false);
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  const applyAllPending = async () => {
    setApplying(true);
    try {
      const { data: recs, error } = await supabase
        .from("ad_recommendations" as any)
        .select("id")
        .eq("channel_id", row.channel_id)
        .eq("status", "pending");
      if (error) throw error;
      const list = ((recs ?? []) as unknown as { id: string }[]);
      if (list.length === 0) {
        toast.info("Nothing to apply", { description: "No pending recommendations on this channel." });
        return;
      }
      let okCount = 0;
      let failCount = 0;
      for (const r of list) {
        const { data, error: invErr } = await supabase.functions.invoke("kennel-execute", {
          body: { recommendation_id: r.id, action: "approve", notes: "bulk apply via channel controls" },
        });
        if (invErr || (data as any)?.error) failCount++;
        else okCount++;
      }
      toast.success(`${okCount} approved`, {
        description: failCount > 0 ? `${failCount} could not be applied.` : `Auto-execute will run where guardrails allow.`,
      });
      await refetchPending();
    } catch (e: any) {
      toast.error("Apply failed", { description: e?.message ?? String(e) });
    } finally {
      setApplying(false);
    }
  };

  const reset = () => { setDraft({ ...DEFAULT_CONTROL }); setDirty(true); };

  return (
    <div className="border border-border bg-card p-4 flex flex-col gap-3" style={SHARP}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold uppercase tracking-brand text-foreground truncate">{row.name}</div>
          <div className="text-[11px] text-muted-foreground capitalize">
            {row.platform} · ${Math.round(row.spend).toLocaleString()} spend · {row.roas.toFixed(2)}× ROAS
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="border border-primary text-primary text-[10px] uppercase tracking-brand font-bold px-2 py-0.5" style={SHARP}>
            {pendingCount} pending
          </span>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] uppercase tracking-brand font-bold text-foreground">Spend</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{draft.spend_pct}%</span>
        </div>
        <Slider
          value={[draft.spend_pct]}
          onValueChange={(v) => update({ spend_pct: v[0] })}
          min={50}
          max={200}
          step={5}
        />
        <div className="flex justify-between mt-1.5 text-[10px] uppercase tracking-brand text-muted-foreground">
          <span>−50%</span>
          <span>Base</span>
          <span>+100%</span>
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          Projected: ${projectedSpend.toLocaleString()}{" "}
          <span className={projectedDelta === 0 ? "" : projectedDelta > 0 ? "text-primary" : "text-amber-700"}>
            ({projectedDelta >= 0 ? "+" : ""}${projectedDelta.toLocaleString()})
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <div className="text-[11px] uppercase tracking-brand font-bold text-foreground">Auto-apply</div>
          <div className="text-[10px] text-muted-foreground">Push changes without manual approval.</div>
        </div>
        <Switch checked={draft.auto_apply} onCheckedChange={(v) => update({ auto_apply: v })} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={reset} style={SHARP} className="uppercase tracking-brand text-[11px]">
          <RotateCcw className="h-3 w-3 mr-1" /> Reset
        </Button>
        <Button size="sm" variant="default" onClick={save} disabled={!dirty || saving} style={SHARP} className="uppercase tracking-brand text-[11px]">
          <Save className="h-3 w-3 mr-1" /> {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={applyAllPending}
          disabled={applying || pendingCount === 0}
          style={SHARP}
          className="uppercase tracking-brand text-[11px] ml-auto"
        >
          <Zap className="h-3 w-3 mr-1" />
          {applying ? "Applying…" : `Apply ${pendingCount || ""}`.trim()}
        </Button>
      </div>

      {dirty && (
        <div className="text-[10px] uppercase tracking-brand text-amber-700">Unsaved changes</div>
      )}
    </div>
  );
}