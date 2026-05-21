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
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Trash2, Loader2, Play, Pause, Square, FlaskConical } from "lucide-react";
import MediaLibraryTab from "@/components/cms/MediaLibraryTab";
import AutopilotTab from "@/components/cms/AutopilotTab";
import SlotFieldsForm from "@/components/cms/SlotFieldsForm";
import { SLOT_SCHEMAS, getSchema, cleanConfig, summarizeConfig, AUDIENCE_OPTIONS } from "@/components/cms/slotSchemas";

// Slot definitions moved to src/components/cms/slotSchemas.ts so the
// Experiments + Rules forms can render plain-language inputs.
const SLOT_CATALOG = SLOT_SCHEMAS;

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

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "test";
}

function ChipPicker({
  label, options, value, onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map((o) => {
          const active = value.includes(o.value);
          return (
            <Badge
              key={o.value}
              variant={active ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </Badge>
          );
        })}
        {value.length === 0 && <span className="text-xs text-muted-foreground self-center">Anyone</span>}
      </div>
    </div>
  );
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
  type FriendlyVariant = { name: string; config: Record<string, unknown>; is_control: boolean };
  const blankForm = () => ({
    name: "",
    description: "",
    slot_key: SLOT_CATALOG[0].key,
    use_bandit: true,
    variants: [
      { name: "Current (control)", config: {}, is_control: true },
      { name: "Option B", config: {}, is_control: false },
    ] as FriendlyVariant[],
  });
  const [form, setForm] = useState(blankForm);
  const resetForm = () => setForm(blankForm());

  const createExperiment = async () => {
    try {
      if (!form.name) {
        toast({ title: "Give your test a name", variant: "destructive" });
        return;
      }
      const baseKey = slugify(form.name);
      const parsedVariants = form.variants.map((v, i) => ({
        key: i === 0 && v.is_control ? "control" : slugify(v.name) || `option_${i + 1}`,
        name: v.name || `Option ${i + 1}`,
        is_control: v.is_control,
        configParsed: cleanConfig(v.config),
      }));

      const { data: exp, error: expErr } = await supabase
        .from("experiments")
        .insert({
          key: `${baseKey}_${Date.now().toString(36)}`,
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

      toast({ title: "Test created as a draft", description: "Press Start when you're ready to run it." });
      setCreating(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["cms-experiments"] });
      qc.invalidateQueries({ queryKey: ["cms-experiment-variants"] });
    } catch (e) {
      toast({ title: "Could not create test", description: (e as Error).message, variant: "destructive" });
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
  type FriendlySegment = Partial<{
    device: string[];
    authState: string[];
    geoIsUS: string;
    hasAmbassadorRef: string;
    referrer: string[];
  }>;
  const blankRule = () => ({
    slot_key: SLOT_CATALOG[0].key,
    name: "",
    priority: 100,
    segment: {} as FriendlySegment,
    variant_config: {} as Record<string, unknown>,
    enabled: true,
  });
  const [ruleForm, setRuleForm] = useState(blankRule);
  const createRule = async () => {
    try {
      const segment: Record<string, unknown> = {};
      const s = ruleForm.segment;
      if (s.device?.length) segment.device = s.device;
      if (s.authState?.length) segment.authState = s.authState;
      if (s.referrer?.length) segment.referrer = s.referrer;
      if (s.geoIsUS) segment.geoIsUS = s.geoIsUS === "true";
      if (s.hasAmbassadorRef) segment.hasAmbassadorRef = s.hasAmbassadorRef === "true";
      const variant_config = cleanConfig(ruleForm.variant_config);
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
      setRuleForm(blankRule());
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
    return <div className="flex items-center justify-center min-h-dvh"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isCmsEditor) return null;

  return (
    <div className="min-h-dvh bg-background">
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
        <Tabs defaultValue="media">
          <TabsList>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
            <TabsTrigger value="rules">Personalization Rules</TabsTrigger>
            <TabsTrigger value="slots">Slot Catalog</TabsTrigger>
            <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
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
                        const fields = summarizeConfig(exp.slot_key, v.config);
                        return (
                          <div key={v.id} className={`border p-3 ${isWinner ? "border-primary" : "border-border"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium text-sm">
                                {v.name}
                                {v.is_control && <Badge variant="outline" className="ml-1">current</Badge>}
                                {isWinner && <Badge className="ml-1">leader</Badge>}
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><div className="text-muted-foreground">People shown</div><div className="font-mono">{v.exposures}</div></div>
                              <div><div className="text-muted-foreground">Click rate</div><div className="font-mono">{fmtCvr(v.conversions, v.exposures)}</div></div>
                              <div><div className="text-muted-foreground">$ / visitor</div><div className="font-mono">{fmtRpv(v.revenue_cents, v.exposures)}</div></div>
                            </div>
                            {fields.length > 0 && (
                              <dl className="mt-3 space-y-1 text-xs">
                                {fields.map((f) => (
                                  <div key={f.label} className="flex gap-2">
                                    <dt className="text-muted-foreground min-w-[7rem]">{f.label}</dt>
                                    <dd className="font-medium break-all">{f.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {totalExposures < 50 && exp.status === "running" && (
                      <p className="text-xs text-muted-foreground mt-3">Need about 50 visitors per option before results mean much.</p>
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
            {rulesQuery.data?.map((r) => {
              const schema = getSchema(r.slot_key);
              const fields = summarizeConfig(r.slot_key, (r.variant_config ?? {}) as Record<string, unknown>);
              const seg = (r.segment ?? {}) as Record<string, unknown>;
              const segChips: string[] = [];
              if (Array.isArray(seg.device)) segChips.push(`Device: ${(seg.device as string[]).join(", ")}`);
              if (Array.isArray(seg.authState)) segChips.push(`Sign-in: ${(seg.authState as string[]).join(", ")}`);
              if (Array.isArray(seg.referrer)) segChips.push(`From: ${(seg.referrer as string[]).join(", ")}`);
              if (typeof seg.geoIsUS === "boolean") segChips.push(seg.geoIsUS ? "In the US" : "Outside the US");
              if (typeof seg.hasAmbassadorRef === "boolean") segChips.push(seg.hasAmbassadorRef ? "From an ambassador link" : "Not from an ambassador link");
              return (
                <Card key={r.id}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {r.name} <Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "on" : "off"}</Badge>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">For: {schema?.label ?? r.slot_key} · Priority {r.priority}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleRule(r.id, !r.enabled)}>{r.enabled ? "Disable" : "Enable"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-muted-foreground mb-2">Who sees this</div>
                      {segChips.length === 0 ? (
                        <p className="text-muted-foreground italic">Everyone</p>
                      ) : (
                        <ul className="space-y-1">{segChips.map((c) => <li key={c}>• {c}</li>)}</ul>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-2">What they see</div>
                      {fields.length === 0 ? (
                        <p className="text-muted-foreground italic">Default (no overrides)</p>
                      ) : (
                        <dl className="space-y-1">
                          {fields.map((f) => (
                            <div key={f.label} className="flex gap-2">
                              <dt className="text-muted-foreground min-w-[6rem]">{f.label}</dt>
                              <dd className="font-medium break-all">{f.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="slots" className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground">These are the spots on the site you can test or personalize. Pick any of them when creating a test or rule.</p>
            {SLOT_CATALOG.map((s) => (
              <Card key={s.key}>
                <CardContent className="py-4">
                  <div className="font-medium mb-1">{s.label}</div>
                  <p className="text-sm text-muted-foreground mb-2">{s.description}</p>
                  <div className="text-xs text-muted-foreground">You can change:</div>
                  <ul className="text-xs mt-1 space-y-0.5">
                    {s.fields.map((f) => <li key={f.key}>• {f.label}</li>)}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="media" className="mt-6">
            <MediaLibraryTab />
          </TabsContent>

          <TabsContent value="autopilot" className="mt-6">
            <AutopilotTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Create experiment dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Test</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <div>
              <Label>What part of the site do you want to test?</Label>
              <Select value={form.slot_key} onValueChange={(v) => setForm({ ...form, slot_key: v, variants: form.variants.map((va) => ({ ...va, config: {} })) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOT_CATALOG.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{getSchema(form.slot_key)?.description}</p>
            </div>
            <div>
              <Label>Give this test a short name</Label>
              <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='e.g. "Try a warmer hero headline"' />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea className="mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What are you hoping to learn?" />
            </div>
            <div className="flex items-center justify-between border border-border p-3">
              <div>
                <Label className="text-sm">Let the system auto-pick winners</Label>
                <p className="text-xs text-muted-foreground mt-1">Recommended. Sends more visitors to whichever option is winning.</p>
              </div>
              <Switch checked={form.use_bandit} onCheckedChange={(c) => setForm({ ...form, use_bandit: c })} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Options to compare</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, variants: [...form.variants, { name: `Option ${String.fromCharCode(65 + form.variants.length)}`, config: {}, is_control: false }] })}>
                  <Plus className="h-3 w-3 mr-1" />Add option
                </Button>
              </div>
              {form.variants.map((v, i) => (
                <div key={i} className="border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Input value={v.name} onChange={(e) => { const arr = [...form.variants]; arr[i] = { ...v, name: e.target.value }; setForm({ ...form, variants: arr }); }} placeholder="Option name" />
                    <label className="flex items-center gap-2 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={v.is_control} onChange={(e) => { const arr = form.variants.map((x, j) => ({ ...x, is_control: j === i ? e.target.checked : (e.target.checked ? false : x.is_control) })); setForm({ ...form, variants: arr }); }} />
                      Current version
                    </label>
                    {form.variants.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </div>
                  {v.is_control ? (
                    <p className="text-xs text-muted-foreground italic">Uses the current live content — nothing to fill in.</p>
                  ) : (
                    <SlotFieldsForm
                      schema={getSchema(form.slot_key)!}
                      value={v.config}
                      onChange={(cfg) => { const arr = [...form.variants]; arr[i] = { ...v, config: cfg }; setForm({ ...form, variants: arr }); }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
            <Button onClick={createExperiment}>Save as draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create rule dialog */}
      <Dialog open={creatingRule} onOpenChange={setCreatingRule}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Personalization Rule</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Show different content to specific groups of visitors. Rules always win over tests.</p>
          <div className="space-y-5">
            <div>
              <Label>What part of the site?</Label>
              <Select value={ruleForm.slot_key} onValueChange={(v) => setRuleForm({ ...ruleForm, slot_key: v, variant_config: {} })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOT_CATALOG.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rule name</Label>
              <Input className="mt-1" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder='e.g. "Welcome back members"' />
            </div>
            <div className="space-y-3 border border-border p-3">
              <div className="font-medium text-sm">Who should see this?</div>
              <ChipPicker
                label="Device"
                options={AUDIENCE_OPTIONS.device}
                value={ruleForm.segment.device ?? []}
                onChange={(arr) => setRuleForm({ ...ruleForm, segment: { ...ruleForm.segment, device: arr } })}
              />
              <ChipPicker
                label="Sign-in status"
                options={AUDIENCE_OPTIONS.authState}
                value={ruleForm.segment.authState ?? []}
                onChange={(arr) => setRuleForm({ ...ruleForm, segment: { ...ruleForm.segment, authState: arr } })}
              />
              <ChipPicker
                label="Came from"
                options={AUDIENCE_OPTIONS.referrer}
                value={ruleForm.segment.referrer ?? []}
                onChange={(arr) => setRuleForm({ ...ruleForm, segment: { ...ruleForm.segment, referrer: arr } })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Location</Label>
                  <Select value={ruleForm.segment.geoIsUS ?? "any"} onValueChange={(v) => setRuleForm({ ...ruleForm, segment: { ...ruleForm.segment, geoIsUS: v === "any" ? undefined : v } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Anywhere</SelectItem>
                      <SelectItem value="true">In the US</SelectItem>
                      <SelectItem value="false">Outside the US</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Ambassador link</Label>
                  <Select value={ruleForm.segment.hasAmbassadorRef ?? "any"} onValueChange={(v) => setRuleForm({ ...ruleForm, segment: { ...ruleForm.segment, hasAmbassadorRef: v === "any" ? undefined : v } })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Doesn't matter</SelectItem>
                      <SelectItem value="true">Came from an ambassador</SelectItem>
                      <SelectItem value="false">Did not come from an ambassador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-2 border border-border p-3">
              <div className="font-medium text-sm">What should they see?</div>
              <p className="text-xs text-muted-foreground">Leave any field blank to keep the default.</p>
              <SlotFieldsForm
                schema={getSchema(ruleForm.slot_key)!}
                value={ruleForm.variant_config}
                onChange={(cfg) => setRuleForm({ ...ruleForm, variant_config: cfg })}
              />
            </div>
            <div className="flex items-center justify-between border border-border p-3">
              <div>
                <Label className="text-sm">Priority</Label>
                <p className="text-xs text-muted-foreground mt-1">Lower numbers run first when multiple rules match.</p>
              </div>
              <Input type="number" className="w-24" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })} />
            </div>
            <div className="flex items-center justify-between border border-border p-3">
              <Label className="text-sm">Enable this rule now</Label>
              <Switch checked={ruleForm.enabled} onCheckedChange={(c) => setRuleForm({ ...ruleForm, enabled: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingRule(false)}>Cancel</Button>
            <Button onClick={createRule}>Create rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}