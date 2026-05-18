import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sliders, Save, RotateCcw } from "lucide-react";

type StrategyMode = {
  goal: number;        // 0 = max ROAS, 100 = max reach
  risk: number;        // 0 = conservative, 100 = aggressive
  pace: number;        // 0 = steady, 100 = burst
  auto_apply: boolean;
  scope?: string;      // "global" or "platform:meta"
  updated_at?: string;
};

const DEFAULTS: StrategyMode = { goal: 35, risk: 30, pace: 50, auto_apply: false };

interface Props {
  scope?: string; // "global" | "platform:meta" | "platform:google" | "platform:instacart"
  onChange?: (mode: StrategyMode) => void;
}

function keyFor(scope: string) {
  return scope === "global" ? "strategy_mode" : `strategy_mode_${scope.replace("platform:", "")}`;
}

function deriveTargets(m: StrategyMode) {
  // Goal → target ROAS floor (max ROAS: 4.0x → max reach: 1.5x)
  const targetRoas = 4.0 - (m.goal / 100) * 2.5;
  // Risk → confidence floor and budget shift
  const confidence = 0.95 - (m.risk / 100) * 0.25;
  const maxBudgetShiftPct = 10 + (m.risk / 100) * 30;
  // Pace → daily spend cap multiplier
  const paceMultiplier = 0.8 + (m.pace / 100) * 1.2;
  return { targetRoas, confidence, maxBudgetShiftPct, paceMultiplier };
}

export function StrategyMixPanel({ scope = "global", onChange }: Props) {
  const qc = useQueryClient();
  const settingsKey = keyFor(scope);
  const [draft, setDraft] = useState<StrategyMode>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const { data: loaded } = useQuery({
    queryKey: ["strategy-mode", settingsKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("ad_settings" as any)
        .select("value, updated_at")
        .eq("key", settingsKey)
        .maybeSingle();
      const value = (data as any)?.value as Partial<StrategyMode> | undefined;
      return { ...DEFAULTS, ...(value ?? {}), updated_at: (data as any)?.updated_at } as StrategyMode;
    },
  });

  useEffect(() => {
    if (loaded) {
      setDraft({ ...loaded });
      setDirty(false);
      onChange?.(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.updated_at]);

  const targets = useMemo(() => deriveTargets(draft), [draft]);

  const update = (patch: Partial<StrategyMode>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const value = { goal: draft.goal, risk: draft.risk, pace: draft.pace, auto_apply: draft.auto_apply, scope };
      const { error } = await supabase
        .from("ad_settings" as any)
        .upsert({ key: settingsKey, value }, { onConflict: "key" });
      if (error) throw error;
      toast.success("Strategy saved", { description: "Optimizer will use it on the next run." });
      await qc.invalidateQueries({ queryKey: ["strategy-mode", settingsKey] });
      setDirty(false);
      onChange?.({ ...draft, scope });
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  const regenForecast = async () => {
    setRegenBusy(true);
    try {
      const platform = scope.startsWith("platform:") ? scope.replace("platform:", "") : undefined;
      const { data, error } = await supabase.functions.invoke("kennel-forecast", {
        body: { platform, horizon_days: 90, lookback_days: 90 },
      });
      if (error) throw error;
      toast.success("Forecast regenerated");
      await qc.invalidateQueries({ queryKey: ["forecast"] });
    } catch (e: any) {
      toast.error("Forecast failed", { description: e?.message ?? String(e) });
    } finally {
      setRegenBusy(false);
    }
  };

  const reset = () => { setDraft({ ...DEFAULTS }); setDirty(true); };

  return (
    <section className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <header className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <h2 className="text-xs uppercase tracking-brand font-bold text-foreground">
            Strategy Mix {scope !== "global" && <span className="text-muted-foreground">· {scope.replace("platform:", "")}</span>}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={reset} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
          <Button size="sm" variant="outline" onClick={regenForecast} disabled={regenBusy} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
            {regenBusy ? "Modeling…" : "Regenerate forecast"}
          </Button>
          <Button size="sm" variant="default" onClick={save} disabled={!dirty || saving} style={{ borderRadius: 0 }} className="uppercase tracking-brand text-xs">
            <Save className="h-3 w-3 mr-1" /> {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SliderRow
          label="Goal"
          left="Max ROAS"
          right="Max Reach"
          value={draft.goal}
          onChange={(v) => update({ goal: v })}
          hint={`Target ROAS floor: ${targets.targetRoas.toFixed(2)}x`}
        />
        <SliderRow
          label="Risk"
          left="Conservative"
          right="Aggressive"
          value={draft.risk}
          onChange={(v) => update({ risk: v })}
          hint={`Confidence ≥${targets.confidence.toFixed(2)} · ±${targets.maxBudgetShiftPct.toFixed(0)}% budget swing`}
        />
        <SliderRow
          label="Pace"
          left="Steady"
          right="Burst"
          value={draft.pace}
          onChange={(v) => update({ pace: v })}
          hint={`Daily spend cap × ${targets.paceMultiplier.toFixed(2)}`}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-brand font-bold text-foreground">Auto-apply recommendations</div>
          <div className="text-[11px] text-muted-foreground">When on, the optimizer pushes changes without manual approval.</div>
        </div>
        <Switch checked={draft.auto_apply} onCheckedChange={(v) => update({ auto_apply: v })} />
      </div>

      {dirty && (
        <div className="mt-3 text-[11px] uppercase tracking-brand text-amber-700">
          Unsaved changes — click Save to push to the optimizer.
        </div>
      )}
    </section>
  );
}

function SliderRow({
  label, left, right, value, onChange, hint,
}: {
  label: string; left: string; right: string; value: number; onChange: (v: number) => void; hint: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-brand font-bold text-foreground">{label}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{value}/100</span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={0} max={100} step={1} />
      <div className="flex justify-between mt-1.5 text-[10px] uppercase tracking-brand text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}