import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Loader2, Play, Pause, Square, FlaskConical } from "lucide-react";

/**
 * Catalog of slots wired into the app. New slots can be added in code and
 * will automatically show up as targetable here. Keep this in sync with
 * actual useExperiment("slot_key", …) calls.
 */
const SLOT_CATALOG: { key: string; label: string; description: string; configHint: string }[] = [
  {
    key: "homepage_hero",
    label: "Homepage Hero",
    description: "Hero image, headline, subtitle, CTA label + destination.",
    configHint: '{ "imageUrl": "https://…", "headlineOverride": "…", "subtitleOverride": "…", "ctaLabel": "Shop Wines", "ctaHref": "/wines" }',
  },
  {
    key: "homepage_ambassador_strip",
    label: "Homepage Ambassador Strip",
    description: "Whether to show the ambassador program block on the homepage and how to frame it.",
    configHint: '{ "show": true, "headline": "…", "ctaLabel": "Become an Ambassador" }',
  },
  {
    key: "homepage_blocks_order",
    label: "Homepage Block Order",
    description: "Reserved for future Mission/Shop/Club/Ambassador reordering.",
    configHint: '{ "order": ["mission","shop","club","ambassador"] }',
  },
  {
    key: "cart_promo_banner",
    label: "Cart Promo Banner",
    description: "Cart promo framing (e.g. case discount vs shipping vs club).",
    configHint: '{ "headline": "Shipping included on 12+", "accent": "primary" }',
  },
  {
    key: "club_featured_tier",
    label: "Wine Club Featured Tier",
    description: "Which tier shows the 'Most Popular' badge.",
    configHint: '{ "tierKey": "6" }',
  },
  {
    key: "ambassador_placement",
    label: "Ambassador CTA Placement",
    description: "Where the apply CTA appears site-wide.",
    configHint: '{ "footer": true, "sticky": false, "postPurchase": true }',
  },
  {
    key: "pdp_layout",
    label: "Product Detail Layout",
    description: "Image-first vs story-first vs reviews-first.",
    configHint: '{ "variant": "image_first" }',
  },
];

const SEGMENT_KEYS = [
  "geoCountry", "geoIsUS", "authState", "device", "referrer", "hasAmbassadorRef",
  "utmSource", "utmMedium", "utmCampaign",
];

type Experiment = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  slot_key: string;
  status: "draft" | "running" | "paused" | "ended";
  primary_metric: string;
  use_bandit: boolean;
  created_at: string;
};

type Variant = {
  id: string;
  experiment_id: string;
  key: string;
  name: string;
  config: Record<string, unknown>;
  is_control: boolean;
  exposures: number;
  conversions: number;
  revenue_cents: number;
};

type Rule = {
  id: string;
  slot_key: string;
  name: string;
  priority: number;
  segment: Record<string, unknown>;
  variant_config: Record<string, unknown>;
  enabled: boolean;
};

function fmtRpv(revenueCents: number, exposures: number) {
  if (!exposures) return "$0.00";
  return `$${(revenueCents / exposures / 100).toFixed(2)}`;
}
function fmtCvr(conversions: number, exposures: number) {
  if (!exposures) return "—";
  return `${((conversions / exposures) * 100).toFixed(1)}%`;
}

export default function CmsExperimentsPage() {
  const { isCmsEditor, loading } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isCmsEditor) navigate("/cms/login");
  }, [loading, isCmsEditor, navigate]);

  const expQuery = useQuery({
    queryKey: ["cms-experiments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Experiment[];
    },
    enabled: isCmsEditor,
  });

  const varQuery = useQuery({
    queryKey: ["cms-experiment-variants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("experiment_variants")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Variant[];
    },
    enabled: isCmsEditor,
  });

  const rulesQuery = useQuery({
    queryKey: ["cms-personalization-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personalization_rules")
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
    enabled: isCmsEditor,
  });

  const variantsByExp = useMemo(() => {
    const m = new Map<string, Variant[]>();
    (varQuery.data ?? []).forEach((v) => {
      const arr = m.get(v.experiment_id) ?? [];
      arr.push(v);
      m.set(v.experiment_id, arr);
    });
    return m;
  }, [varQuery.data]);

  // ── Create experiment dialog state ──
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    key: "",
    name: "",
    description: "",
    slot_key: SLOT_CATALOG[0].key,
    use_bandit: true,
    variants: [
      { key: "control", name: "Control", config: "{}", is_control: true },
      { key: "variant_a", name: "Variant A", config: "{}", is_control: false },
    ],
  });

  const resetForm = () =>
    setForm({
      key: "",
      name: "",
      description: "",
      slot_key: SLOT_CATALOG[0].key,
      use_bandit: true,
      variants: [
        { key: "control", name: "Control", config: "{}", is_control: true },
        { key: "variant_a", name: "Variant A", config: "{}", is_control: false },
      ],
    });

  const createExperiment = async () => {
    try {
      if (!form.key || !form.name) {
        toast({ title: "Key and name required", variant: "destructive" });
        return;
      }
      // Parse variant configs first
      const parsedVariants = form.variants.map((v) => {
        let cfg: Record<string, unknown> = {};
        try { cfg = v.config.trim() ? JSON.parse(v.config) : {}; }
        catch (e) { throw new Error(`Invalid JSON in variant ${v.key}: ${(e as Error).message}`); }
        return { ...v, configParsed: cfg };
      });

      const { data: exp, error: expErr } = await supabase
        .from("experiments")
        .insert({
          key: form.key,
          name: form.name,
          description: form.description || null,
          slot_key: form.slot_key,
          use_bandit: form.use_bandit,
          status: "draft",
        })
        .select("*")
        .single();
      if (expErr) throw expErr;

      const { error: vErr } = await supabase
        .from("experiment_variants")
        .insert(
          parsedVariants.map((v) => ({
            experiment_id: (exp as Experiment).id,
            key: v.key,
            name: v.name,
            config: v.configParsed as never,
            is_control: v.is_control,
          })),
        );
      if (vErr) throw vErr;

      toast({ title: "Experiment created (draft)" });
      setCreating(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["cms-experiments"] });
      qc.invalidateQueries({ queryKey: ["cms-experiment-variants"] });
    } catch (e) {
      toast({ title: "Could not create experiment", description: (e as Error).message, variant: "destructive" });
    }
  };

  const setStatus = async (id: string, status: Experiment["status"]) => {
    const { error } = await supabase.from("experiments").update({ status }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["cms-experiments"] });
  };

  const deleteExperiment = async (id: string) => {
    if (!confirm("Delete experiment and all its data?")) return;
    const { error } = await supabase.from("experiments").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["cms-experiments"] });
    qc.invalidateQueries({ queryKey: ["cms-experiment-variants"] });
  };

  // ── Personalization rule create ──
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    slot_key: SLOT_CATALOG[0].key,
    name: "",
    priority: 100,
    segment: '{}',
    variant_config: '{}',
    enabled: true,
  });
  const createRule = async () => {
    try {
      const segment = ruleForm.segment.trim() ? JSON.parse(ruleForm.segment) : {};
      const variant_config = ruleForm.variant_config.trim() ? JSON.parse(ruleForm.variant_config) : {};
      const { error } = await supabase.from("personalization_rules").insert({
        slot_key: ruleForm.slot_key,
        name: ruleForm.name || "Untitled rule",
        priority: ruleForm.priority,
        segment: segment as never,
        variant_config: variant_config as never,
        enabled: ruleForm.enabled,
      });
      if (error) throw error;
      toast({ title: "Rule created" });
      setCreatingRule(false);
      setRuleForm({ slot_key: SLOT_CATALOG[0].key, name: "", priority: 100, segment: "{}", variant_config: "{}", enabled: true });
      qc.invalidateQueries({ queryKey: ["cms-personalization-rules"] });
    } catch (e) {
      toast({ title: "Could not create rule", description: (e as Error).message, variant: "destructive" });
    }
  };
  const toggleRule = async (id: string, enabled: boolean) => {
    const { error } = await supabase.from("personalization_rules").update({ enabled }).eq("id", id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["cms-personalization-rules"] });
  };
  const deleteRule = async (id: string) => {
    if (!confirm("Delete rule?")) return;
    const { error } = await supabase.from("personalization_rules").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["cms-personalization-rules"] });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isCmsEditor) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm"><Link to="/cms"><ArrowLeft className="h-4 w-4 mr-2" />Back to CMS</Link></Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" />Experiments &amp; Personalization</h1>
              <p className="text-xs text-muted-foreground">Self-optimizing surfaces. Bandit picks winners automatically.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="experiments">
          <TabsList>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="rules">Personalization Rules</TabsTrigger>
            <TabsTrigger value="slots">Slot Catalog</TabsTrigger>
          </TabsList>

          <TabsContent value="experiments" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-2" />New Experiment</Button>
            </div>
            {expQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {expQuery.data?.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                No experiments yet. Create one to start optimizing.
              </CardContent></Card>
            )}
            {expQuery.data?.map((exp) => {
              const variants = variantsByExp.get(exp.id) ?? [];
              const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);
              const winner = variants.reduce<Variant | null>((best, v) => {
                const rpv = v.exposures ? v.revenue_cents / v.exposures : 0;
                const bestRpv = best && best.exposures ? best.revenue_cents / best.exposures : 0;
                return rpv > bestRpv ? v : best;
              }, null);
              return (
                <Card key={exp.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {exp.name}
                        <Badge variant={exp.status === "running" ? "default" : exp.status === "ended" ? "secondary" : "outline"}>{exp.status}</Badge>
                        {exp.use_bandit && <Badge variant="outline">bandit</Badge>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        <code>{exp.key}</code> · slot <code>{exp.slot_key}</code> · metric <code>{exp.primary_metric}</code>
                      </p>
                      {exp.description && <p className="text-xs text-muted-foreground">{exp.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {exp.status !== "running" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(exp.id, "running")}><Play className="h-3 w-3 mr-1" />Start</Button>
                      )}
                      {exp.status === "running" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(exp.id, "paused")}><Pause className="h-3 w-3 mr-1" />Pause</Button>
                      )}
                      {exp.status !== "ended" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(exp.id, "ended")}><Square className="h-3 w-3 mr-1" />End</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteExperiment(exp.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {variants.map((v) => {
                        const isWinner = winner?.id === v.id && totalExposures > 50;
                        return (
                          <div key={v.id} className={`border p-3 ${isWinner ? "border-primary" : "border-border"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium text-sm">{v.name} {v.is_control && <Badge variant="outline" className="ml-1">control</Badge>}{isWinner && <Badge className="ml-1">leader</Badge>}</div>
                              <code className="text-xs text-muted-foreground">{v.key}</code>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><div className="text-muted-foreground">Exposures</div><div className="font-mono">{v.exposures}</div></div>
                              <div><div className="text-muted-foreground">CVR</div><div className="font-mono">{fmtCvr(v.conversions, v.exposures)}</div></div>
                              <div><div className="text-muted-foreground">Rev/visitor</div><div className="font-mono">{fmtRpv(v.revenue_cents, v.exposures)}</div></div>
                            </div>
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer">config</summary>
                              <pre className="text-[10px] mt-1 bg-muted p-2 overflow-auto">{JSON.stringify(v.config, null, 2)}</pre>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                    {totalExposures < 50 && exp.status === "running" && (
                      <p className="text-xs text-muted-foreground mt-3">Need ~50 exposures per variant before results are meaningful.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="rules" className="mt-6 space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setCreatingRule(true)}><Plus className="h-4 w-4 mr-2" />New Rule</Button>
            </div>
            {rulesQuery.data?.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
                No personalization rules yet. Rules take precedence over experiments.
              </CardContent></Card>
            )}
            {rulesQuery.data?.map((r) => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{r.name} <Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "on" : "off"}</Badge></CardTitle>
                    <p className="text-xs text-muted-foreground">slot <code>{r.slot_key}</code> · priority {r.priority}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggleRule(r.id, !r.enabled)}>{r.enabled ? "Disable" : "Enable"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div><div className="text-muted-foreground mb-1">Segment</div><pre className="bg-muted p-2 overflow-auto">{JSON.stringify(r.segment, null, 2)}</pre></div>
                  <div><div className="text-muted-foreground mb-1">Config override</div><pre className="bg-muted p-2 overflow-auto">{JSON.stringify(r.variant_config, null, 2)}</pre></div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="slots" className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">Surfaces currently wired into the app. Reference these slot keys when creating experiments or rules.</p>
            {SLOT_CATALOG.map((s) => (
              <Card key={s.key}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{s.label}</div>
                    <code className="text-xs bg-muted px-2 py-1">{s.key}</code>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                  <pre className="text-[11px] bg-muted p-2 mt-2 overflow-auto">{s.configHint}</pre>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </main>

      {/* Create experiment dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Experiment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Key (unique)</Label>
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() })} placeholder="hero_red_blend_test" />
              </div>
              <div>
                <Label>Slot</Label>
                <Select value={form.slot_key} onValueChange={(v) => setForm({ ...form, slot_key: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SLOT_CATALOG.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.use_bandit} onChange={(e) => setForm({ ...form, use_bandit: e.target.checked })} />
              Use bandit (auto-shift traffic to winners)
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variants</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, variants: [...form.variants, { key: `variant_${form.variants.length}`, name: `Variant ${form.variants.length}`, config: "{}", is_control: false }] })}>
                  <Plus className="h-3 w-3 mr-1" />Add variant
                </Button>
              </div>
              {form.variants.map((v, i) => (
                <div key={i} className="border border-border p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={v.key} onChange={(e) => { const arr = [...form.variants]; arr[i] = { ...v, key: e.target.value }; setForm({ ...form, variants: arr }); }} placeholder="variant key" />
                    <Input value={v.name} onChange={(e) => { const arr = [...form.variants]; arr[i] = { ...v, name: e.target.value }; setForm({ ...form, variants: arr }); }} placeholder="display name" />
                  </div>
                  <Textarea value={v.config} onChange={(e) => { const arr = [...form.variants]; arr[i] = { ...v, config: e.target.value }; setForm({ ...form, variants: arr }); }} rows={3} className="font-mono text-xs" placeholder="{}" />
                  <div className="flex items-center justify-between text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={v.is_control} onChange={(e) => { const arr = [...form.variants]; arr[i] = { ...v, is_control: e.target.checked }; setForm({ ...form, variants: arr }); }} />
                      control
                    </label>
                    {form.variants.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
            <Button onClick={createExperiment}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create rule dialog */}
      <Dialog open={creatingRule} onOpenChange={setCreatingRule}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Personalization Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Slot</Label>
                <Select value={ruleForm.slot_key} onValueChange={(v) => setRuleForm({ ...ruleForm, slot_key: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SLOT_CATALOG.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Priority (lower = first)</Label><Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Name</Label><Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /></div>
            <div>
              <Label>Segment (JSON). Keys: {SEGMENT_KEYS.join(", ")}</Label>
              <Textarea value={ruleForm.segment} onChange={(e) => setRuleForm({ ...ruleForm, segment: e.target.value })} rows={4} className="font-mono text-xs"
                placeholder='{"authState":["member"],"device":["mobile"]}' />
            </div>
            <div>
              <Label>Variant config (JSON)</Label>
              <Textarea value={ruleForm.variant_config} onChange={(e) => setRuleForm({ ...ruleForm, variant_config: e.target.value })} rows={4} className="font-mono text-xs"
                placeholder='{"headlineOverride":"Welcome back to The Pack"}' />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ruleForm.enabled} onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })} /> enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingRule(false)}>Cancel</Button>
            <Button onClick={createRule}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}