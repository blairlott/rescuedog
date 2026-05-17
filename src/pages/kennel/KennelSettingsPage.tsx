import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldAlert, Power } from "lucide-react";

const SHARP = { borderRadius: 0 } as const;
const BRAND_FONT = { fontFamily: '"Nunito Sans", system-ui, sans-serif' } as const;

type SettingRow = { key: string; value: any };
type Guardrail = {
  channel_id: string; channel_name?: string;
  daily_spend_cap_cents: number; max_bid_change_pct: number;
  max_budget_change_pct: number; paused: boolean;
};

export default function KennelSettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [killConfirm, setKillConfirm] = useState(false);

  const load = async () => {
    const [{ data: s }, { data: g }, { data: c }] = await Promise.all([
      supabase.from("ad_settings").select("key,value"),
      supabase.from("ad_guardrails").select("*"),
      supabase.from("ad_channels").select("id,name"),
    ]);
    const sMap: Record<string, any> = {};
    (s as SettingRow[] ?? []).forEach((r) => (sMap[r.key] = r.value));
    setSettings(sMap);
    const nameById = Object.fromEntries((c ?? []).map((x: any) => [x.id, x.name]));
    setGuardrails(((g as Guardrail[]) ?? []).map((x) => ({ ...x, channel_name: nameById[x.channel_id] })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveSetting = async (key: string, value: any) => {
    const { error } = await supabase.from("ad_settings").upsert({ key, value }, { onConflict: "key" });
    if (error) toast.error(error.message);
    else { setSettings((p) => ({ ...p, [key]: value })); toast.success("Saved"); }
  };
  const saveGuardrail = async (g: Guardrail) => {
    const { error } = await supabase.from("ad_guardrails").update({
      daily_spend_cap_cents: g.daily_spend_cap_cents,
      max_bid_change_pct: g.max_bid_change_pct,
      max_budget_change_pct: g.max_budget_change_pct,
      paused: g.paused,
    }).eq("channel_id", g.channel_id);
    if (error) toast.error(error.message); else toast.success(`${g.channel_name} updated`);
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const killSwitch = settings.kill_switch === true;
  const confFloor = Number(settings.confidence_floor ?? 0.6);
  const dailyCap = Number(settings.daily_spend_cap_cents ?? 500000);
  const mode = String(settings.ingestion_mode ?? "lindy_primary");

  return (
    <div className="p-6 max-w-[1400px] space-y-8" style={BRAND_FONT}>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-brand">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Guardrails, ingestion mode, and kill switch.</p>
        </div>
        <Button
          variant={killSwitch ? "destructive" : "outline"}
          style={SHARP}
          onClick={() => setKillConfirm(true)}
          className="gap-2"
        >
          <Power className="h-4 w-4" />
          {killSwitch ? "Kill switch ENGAGED" : "Engage kill switch"}
        </Button>
      </header>

      {killSwitch && (
        <div className="border-2 border-destructive bg-destructive/10 p-4 flex items-start gap-3" style={SHARP}>
          <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold uppercase text-destructive">Auto-execution disabled</div>
            <div className="text-foreground/80">Ingestion continues. No recommendation can be approved or executed.</div>
          </div>
        </div>
      )}

      <section className="border border-border bg-card p-5 space-y-5" style={SHARP}>
        <h2 className="text-sm uppercase font-bold tracking-brand">Global controls</h2>

        <div>
          <Label className="text-xs uppercase tracking-brand">Ingestion mode</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            {(["lindy_primary","native_primary","lindy_only","native_only"] as const).map((m) => (
              <Button key={m} size="sm" style={SHARP}
                variant={mode === m ? "default" : "outline"}
                onClick={() => saveSetting("ingestion_mode", m)}>
                {m.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-xs uppercase tracking-brand">
            Confidence floor: {Math.round(confFloor * 100)}%
          </Label>
          <Slider
            min={0} max={100} step={5}
            value={[Math.round(confFloor * 100)]}
            onValueChange={(v) => setSettings((p) => ({ ...p, confidence_floor: v[0] / 100 }))}
            onValueCommit={(v) => saveSetting("confidence_floor", v[0] / 100)}
            className="mt-3 max-w-md"
          />
        </div>

        <div className="max-w-xs">
          <Label className="text-xs uppercase tracking-brand">Daily spend cap (USD)</Label>
          <Input
            type="number" min={0}
            style={SHARP}
            value={Math.round(dailyCap / 100)}
            onChange={(e) => setSettings((p) => ({ ...p, daily_spend_cap_cents: Math.max(0, Number(e.target.value) * 100) }))}
            onBlur={() => saveSetting("daily_spend_cap_cents", Math.max(0, Number(dailyCap)))}
            className="mt-2"
          />
        </div>
      </section>

      <section className="border border-border bg-card p-5 space-y-3" style={SHARP}>
        <h2 className="text-sm uppercase font-bold tracking-brand">Per-channel guardrails</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-brand text-muted-foreground border-b border-border">
              <th className="py-2">Channel</th>
              <th>Daily cap ($)</th>
              <th>Max bid Δ%</th>
              <th>Max budget Δ%</th>
              <th>Paused</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {guardrails.map((g, i) => (
              <tr key={g.channel_id} className="border-b border-border last:border-0">
                <td className="py-2 font-bold">{g.channel_name}</td>
                <td>
                  <Input type="number" min={0} style={SHARP} className="w-28 h-8"
                    value={Math.round(g.daily_spend_cap_cents / 100)}
                    onChange={(e) => setGuardrails((p) => p.map((x, ix) => ix === i ? { ...x, daily_spend_cap_cents: Number(e.target.value) * 100 } : x))} />
                </td>
                <td>
                  <Input type="number" min={0} max={100} style={SHARP} className="w-24 h-8"
                    value={g.max_bid_change_pct}
                    onChange={(e) => setGuardrails((p) => p.map((x, ix) => ix === i ? { ...x, max_bid_change_pct: Number(e.target.value) } : x))} />
                </td>
                <td>
                  <Input type="number" min={0} max={100} style={SHARP} className="w-24 h-8"
                    value={g.max_budget_change_pct}
                    onChange={(e) => setGuardrails((p) => p.map((x, ix) => ix === i ? { ...x, max_budget_change_pct: Number(e.target.value) } : x))} />
                </td>
                <td>
                  <Switch checked={g.paused}
                    onCheckedChange={(v) => setGuardrails((p) => p.map((x, ix) => ix === i ? { ...x, paused: v } : x))} />
                </td>
                <td>
                  <Button size="sm" style={SHARP} onClick={() => saveGuardrail(g)}>Save</Button>
                </td>
              </tr>
            ))}
            {guardrails.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No channels configured.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <AlertDialog open={killConfirm} onOpenChange={setKillConfirm}>
        <AlertDialogContent style={SHARP}>
          <AlertDialogHeader>
            <AlertDialogTitle className="uppercase tracking-brand">
              {killSwitch ? "Disengage kill switch?" : "Engage kill switch?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {killSwitch
                ? "This re-enables approval and execution of recommendations."
                : "Ingestion continues but no recommendation can be approved or executed until disengaged."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={SHARP}>Cancel</AlertDialogCancel>
            <AlertDialogAction style={SHARP} onClick={() => saveSetting("kill_switch", !killSwitch)}>
              {killSwitch ? "Disengage" : "Engage"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}