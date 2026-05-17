import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Check, X, Settings as SettingsIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const SHARP = { borderRadius: 0 } as const;

type Idea = {
  id: string;
  keyword: string;
  match_type: string;
  source: "ai" | "google_plan" | "semrush" | "search_term";
  score: number;
  recommended_action: "add" | "negative" | "raise_bid" | "lower_bid" | "pause";
  recommended_bid_micros: number | null;
  volume: number | null;
  cpc_micros: number | null;
  competition: string | null;
  status: "pending" | "awaiting_approval" | "applied" | "rejected" | "failed";
  reasoning: string | null;
};

type Settings = {
  platform: string;
  engine_enabled: boolean;
  auto_apply: boolean;
  pause_threshold_cents: number;
  pause_zero_conv_days: number;
  bid_raise_gate_pct: number;
  max_daily_adds: number;
  budget_pacing_enabled?: boolean;
  bid_optimization_enabled?: boolean;
  auto_pause_enabled?: boolean;
  target_roas?: number;
  bid_raise_step_pct?: number;
  bid_lower_step_pct?: number;
  bid_lower_gate_pct?: number;
  max_daily_bid_changes?: number;
  max_daily_budget_shift_pct?: number;
  budget_floor_cents?: number;
  budget_ceiling_cents?: number;
  lookback_days?: number;
  min_clicks_for_bid_change?: number;
};

const SOURCE_LABEL: Record<string, string> = {
  ai: "AI",
  google_plan: "Google Plan",
  semrush: "Semrush",
  search_term: "Search-term",
};

export default function KeywordEnginePanel({ platform, campaignId, adGroupId }: { platform: "google" | "instacart"; campaignId?: string; adGroupId: string }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "awaiting_approval" | "applied" | "rejected">("pending");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-keyword-engine", {
        body: { action: "list", platform, ad_group_id: adGroupId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setIdeas((data as any).ideas ?? []);
      setSettings((data as any).settings ?? null);
    } catch (e: any) {
      toast.error(e.message ?? "Load failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [platform, adGroupId]);

  const generate = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-keyword-engine", {
        body: { action: "generate", platform, campaign_id: campaignId, ad_group_id: adGroupId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const c = (data as any).counts ?? {};
      toast.success(`Engine ran · ${c.inserted ?? 0} new ideas (AI ${c.ai}, GPlan ${c.google_plan}, Semrush ${c.semrush}, Search-term ${c.search_terms})`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Engine failed");
    } finally { setRunning(false); }
  };

  const apply = async (id: string, doApply: boolean) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-keyword-engine", {
        body: { action: doApply ? "apply" : "reject", idea_id: id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(doApply ? "Applied to platform" : "Rejected");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusyId(null); }
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    try {
      const { error } = await supabase.functions.invoke("kennel-keyword-engine", {
        body: { action: "update_settings", platform, fields: {
          engine_enabled: settingsDraft.engine_enabled,
          auto_apply: settingsDraft.auto_apply,
          pause_threshold_cents: settingsDraft.pause_threshold_cents,
          pause_zero_conv_days: settingsDraft.pause_zero_conv_days,
          bid_raise_gate_pct: settingsDraft.bid_raise_gate_pct,
          max_daily_adds: settingsDraft.max_daily_adds,
          budget_pacing_enabled: settingsDraft.budget_pacing_enabled,
          bid_optimization_enabled: settingsDraft.bid_optimization_enabled,
          auto_pause_enabled: settingsDraft.auto_pause_enabled,
          target_roas: settingsDraft.target_roas,
          bid_raise_step_pct: settingsDraft.bid_raise_step_pct,
          bid_lower_step_pct: settingsDraft.bid_lower_step_pct,
          bid_lower_gate_pct: settingsDraft.bid_lower_gate_pct,
          max_daily_bid_changes: settingsDraft.max_daily_bid_changes,
          max_daily_budget_shift_pct: settingsDraft.max_daily_budget_shift_pct,
          budget_floor_cents: settingsDraft.budget_floor_cents,
          budget_ceiling_cents: settingsDraft.budget_ceiling_cents,
          lookback_days: settingsDraft.lookback_days,
          min_clicks_for_bid_change: settingsDraft.min_clicks_for_bid_change,
        }},
      });
      if (error) throw error;
      toast.success("Settings saved");
      setSettingsOpen(false);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
  };

  const filtered = ideas.filter(i => i.status === tab);
  const counts = {
    pending: ideas.filter(i => i.status === "pending").length,
    awaiting_approval: ideas.filter(i => i.status === "awaiting_approval").length,
    applied: ideas.filter(i => i.status === "applied").length,
    rejected: ideas.filter(i => i.status === "rejected" || i.status === "failed").length,
  };

  return (
    <div className="border border-border bg-card p-4 mt-6" style={SHARP}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-bold uppercase tracking-brand text-foreground">Keyword Engine</h3>
            {settings?.auto_apply && <Badge style={SHARP} className="text-[10px] bg-primary text-primary-foreground">SEMI-AUTO</Badge>}
            {settings && !settings.engine_enabled && <Badge style={SHARP} className="text-[10px] bg-muted text-muted-foreground">DISABLED</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Generates from AI, Google Plan, Semrush, and your search-term reports. High-score adds auto-apply; gated picks await approval.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" style={SHARP} onClick={() => { setSettingsDraft(settings); setSettingsOpen(true); }}>
            <SettingsIcon className="h-3 w-3 mr-1" /> Settings
          </Button>
          <Button size="sm" variant="outline" style={SHARP} onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" style={SHARP} onClick={generate} disabled={running}>
            <Sparkles className={`h-3 w-3 mr-1 ${running ? "animate-pulse" : ""}`} />
            {running ? "Generating…" : "Run engine"}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList style={SHARP}>
          <TabsTrigger value="pending" style={SHARP}>Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="awaiting_approval" style={SHARP}>Needs approval ({counts.awaiting_approval})</TabsTrigger>
          <TabsTrigger value="applied" style={SHARP}>Applied ({counts.applied})</TabsTrigger>
          <TabsTrigger value="rejected" style={SHARP}>Rejected ({counts.rejected})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-3">
          {filtered.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">
              {tab === "pending" ? "No pending ideas. Click Run engine to generate some." : `No ${tab.replace("_", " ")} ideas yet.`}
            </div>
          ) : (
            <div className="border border-border" style={SHARP}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-brand text-muted-foreground border-b border-border">
                    <th className="px-3 py-2">Keyword</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Vol / CPC</th>
                    <th className="px-3 py-2">Why</th>
                    <th className="px-3 py-2 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-bold text-foreground">{i.keyword}</div>
                        <div className="text-[10px] text-muted-foreground uppercase">{i.match_type}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge style={SHARP} className={`text-[10px] uppercase ${i.recommended_action === "negative" ? "bg-destructive/20 text-destructive" : "bg-secondary"}`}>
                          {i.recommended_action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">{SOURCE_LABEL[i.source] ?? i.source}</td>
                      <td className="px-3 py-2 text-xs font-mono">{i.score}</td>
                      <td className="px-3 py-2 text-xs">
                        {i.volume ? `${i.volume.toLocaleString()}/mo` : "—"}
                        {i.cpc_micros ? ` · $${(i.cpc_micros / 1_000_000).toFixed(2)}` : ""}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground max-w-[260px]">{i.reasoning ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {(i.status === "pending" || i.status === "awaiting_approval") && (
                            <>
                              <Button size="sm" variant="outline" style={SHARP} disabled={busyId === i.id} onClick={() => apply(i.id, true)}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" style={SHARP} disabled={busyId === i.id} onClick={() => apply(i.id, false)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {i.status === "applied" && <Badge style={SHARP} className="text-[10px] bg-primary text-primary-foreground">LIVE</Badge>}
                          {i.status === "failed" && <Badge style={SHARP} className="text-[10px] bg-destructive/20 text-destructive">FAILED</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent style={SHARP}>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-brand">Keyword Engine · {platform}</DialogTitle>
          </DialogHeader>
          {settingsDraft && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-brand">Engine enabled</Label>
                <Switch checked={settingsDraft.engine_enabled} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, engine_enabled: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs uppercase tracking-brand">Semi-auto apply</Label>
                  <div className="text-[10px] text-muted-foreground">Off = every idea waits for approval</div>
                </div>
                <Switch checked={settingsDraft.auto_apply} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, auto_apply: v })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-brand">Auto-pause spend threshold ($)</Label>
                <Input style={SHARP} type="number" value={settingsDraft.pause_threshold_cents / 100}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, pause_threshold_cents: Math.round(Number(e.target.value) * 100) })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-brand">Zero-conversion lookback (days)</Label>
                <Input style={SHARP} type="number" value={settingsDraft.pause_zero_conv_days}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, pause_zero_conv_days: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-brand">Bid-raise gate (%)</Label>
                <Input style={SHARP} type="number" value={settingsDraft.bid_raise_gate_pct}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, bid_raise_gate_pct: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-brand">Max daily auto-adds</Label>
                <Input style={SHARP} type="number" value={settingsDraft.max_daily_adds}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, max_daily_adds: Number(e.target.value) })} />
              </div>

              <div className="border-t border-border pt-3 mt-3">
                <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-2 font-bold">Budget pacing</div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-brand">Auto-redistribute daily budgets</Label>
                  <Switch checked={!!settingsDraft.budget_pacing_enabled} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, budget_pacing_enabled: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Max shift / run (%)</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.max_daily_budget_shift_pct ?? 25}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, max_daily_budget_shift_pct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Lookback (days)</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.lookback_days ?? 7}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, lookback_days: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Floor ($/day)</Label>
                    <Input style={SHARP} type="number" value={(settingsDraft.budget_floor_cents ?? 500) / 100}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, budget_floor_cents: Math.round(Number(e.target.value) * 100) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Ceiling ($/day)</Label>
                    <Input style={SHARP} type="number" value={(settingsDraft.budget_ceiling_cents ?? 50000) / 100}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, budget_ceiling_cents: Math.round(Number(e.target.value) * 100) })} />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 mt-3">
                <div className="text-[10px] uppercase tracking-brand text-muted-foreground mb-2 font-bold">Bid optimization</div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-brand">Auto-tune bids</Label>
                  <Switch checked={!!settingsDraft.bid_optimization_enabled} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, bid_optimization_enabled: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Target ROAS (x)</Label>
                    <Input style={SHARP} type="number" step="0.1" value={settingsDraft.target_roas ?? 3}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, target_roas: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Min clicks to act</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.min_clicks_for_bid_change ?? 25}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, min_clicks_for_bid_change: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Raise step (%)</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.bid_raise_step_pct ?? 15}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bid_raise_step_pct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Lower step (%)</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.bid_lower_step_pct ?? 20}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bid_lower_step_pct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Lower gate (% of target)</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.bid_lower_gate_pct ?? 50}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, bid_lower_gate_pct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-brand">Max bid changes / run</Label>
                    <Input style={SHARP} type="number" value={settingsDraft.max_daily_bid_changes ?? 25}
                      onChange={(e) => setSettingsDraft({ ...settingsDraft, max_daily_bid_changes: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 mt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs uppercase tracking-brand">Auto-pause zero-ROAS</Label>
                    <div className="text-[10px] text-muted-foreground">Uses spend threshold + lookback above</div>
                  </div>
                  <Switch checked={!!settingsDraft.auto_pause_enabled} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, auto_pause_enabled: v })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" style={SHARP} onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button style={SHARP} onClick={saveSettings}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}