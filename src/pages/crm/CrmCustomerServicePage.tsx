import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Mail, Bot, Save, RotateCcw } from "lucide-react";

type WelcomeTemplate = { name: string; title: string; defaultSubject: string; description: string };

const WELCOME_TEMPLATES: WelcomeTemplate[] = [
  { name: "welcome-1-story", title: "1. Story (Day 0)", defaultSubject: "Welcome to the pack 🐾", description: "Sent immediately on signup." },
  { name: "welcome-2-sampler", title: "2. Sampler (Day 2)", defaultSubject: "Start with our Sampler", description: "Soft intro to the wine lineup." },
  { name: "welcome-3-reviews", title: "3. Reviews (Day 5)", defaultSubject: "What our pack is saying", description: "Social proof and reviews." },
  { name: "welcome-4-mission", title: "4. Mission (Day 9)", defaultSubject: "Every bottle helps a dog", description: "Mission deep-dive." },
  { name: "welcome-5-nudge", title: "5. Nudge (Day 14)", defaultSubject: "Ready to pour with purpose?", description: "Final conversion nudge." },
];

type Override = { template_name: string; subject: string | null; body_html: string | null; enabled: boolean };

export default function CrmCustomerServicePage() {
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(true);
  const [seriesSaving, setSeriesSaving] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body_html: string; enabled: boolean }>>({});
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: setting } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "welcome_series_enabled")
        .maybeSingle();
      setSeriesEnabled(setting?.value === true);
      setSeriesLoading(false);

      const { data: rows } = await supabase
        .from("email_template_overrides")
        .select("template_name, subject, body_html, enabled")
        .in("template_name", WELCOME_TEMPLATES.map((t) => t.name));
      const map: Record<string, Override> = {};
      const draftMap: Record<string, { subject: string; body_html: string; enabled: boolean }> = {};
      (rows ?? []).forEach((r: any) => {
        map[r.template_name] = r;
        draftMap[r.template_name] = { subject: r.subject ?? "", body_html: r.body_html ?? "", enabled: !!r.enabled };
      });
      WELCOME_TEMPLATES.forEach((t) => {
        if (!draftMap[t.name]) draftMap[t.name] = { subject: "", body_html: "", enabled: false };
      });
      setOverrides(map);
      setDrafts(draftMap);
    })();
  }, []);

  async function toggleSeries(next: boolean) {
    setSeriesSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "welcome_series_enabled", value: next as any }, { onConflict: "key" });
    setSeriesSaving(false);
    if (error) {
      toast.error("Failed to update setting");
      return;
    }
    setSeriesEnabled(next);
    toast.success(next ? "Welcome series enabled" : "Welcome series disabled");
  }

  async function saveTemplate(name: string) {
    const d = drafts[name];
    if (!d) return;
    setSavingTemplate(name);
    const { error } = await supabase
      .from("email_template_overrides")
      .upsert(
        {
          template_name: name,
          subject: d.subject.trim() || null,
          body_html: d.body_html.trim() || null,
          enabled: d.enabled,
        },
        { onConflict: "template_name" },
      );
    setSavingTemplate(null);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    toast.success("Saved");
    setOverrides((prev) => ({ ...prev, [name]: { template_name: name, subject: d.subject, body_html: d.body_html, enabled: d.enabled } }));
  }

  async function resetTemplate(name: string) {
    if (!confirm("Reset this template to the built-in default? Your customizations will be deleted.")) return;
    const { error } = await supabase.from("email_template_overrides").delete().eq("template_name", name);
    if (error) {
      toast.error("Reset failed");
      return;
    }
    setDrafts((prev) => ({ ...prev, [name]: { subject: "", body_html: "", enabled: false } }));
    setOverrides((prev) => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
    toast.success("Reset to default");
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-brand uppercase">Customer Service</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage welcome emails, content overrides, and AI agent support.</p>
      </div>

      {/* Welcome series toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Welcome Email Series</CardTitle>
              <CardDescription>5-part onboarding sequence triggered on signup. Disabled by default.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {seriesLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">{seriesEnabled ? "ON" : "OFF"}</span>
                  <Switch checked={seriesEnabled} disabled={seriesSaving} onCheckedChange={toggleSeries} />
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle>Welcome Email Editor</CardTitle>
          <CardDescription>
            Override subject line and HTML body per step. Leave blank to use the built-in default. Toggle each override on to make it take effect.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {WELCOME_TEMPLATES.map((t) => {
            const d = drafts[t.name] ?? { subject: "", body_html: "", enabled: false };
            const isCustom = !!overrides[t.name]?.enabled;
            return (
              <div key={t.name} className="border border-border rounded p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{t.title}</h3>
                      {isCustom ? <Badge variant="default">Custom</Badge> : <Badge variant="secondary">Default</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    <p className="text-xs text-muted-foreground">Template: <code>{t.name}</code></p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`enabled-${t.name}`} className="text-xs">Use override</Label>
                    <Switch
                      id={`enabled-${t.name}`}
                      checked={d.enabled}
                      onCheckedChange={(v) => setDrafts((p) => ({ ...p, [t.name]: { ...d, enabled: v } }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`subject-${t.name}`}>Subject</Label>
                  <Input
                    id={`subject-${t.name}`}
                    placeholder={t.defaultSubject}
                    value={d.subject}
                    onChange={(e) => setDrafts((p) => ({ ...p, [t.name]: { ...d, subject: e.target.value } }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`body-${t.name}`}>HTML Body</Label>
                  <Textarea
                    id={`body-${t.name}`}
                    placeholder="<p>Custom HTML for this email. Leave blank to keep the default React template.</p>"
                    rows={8}
                    className="font-mono text-xs"
                    value={d.body_html}
                    onChange={(e) => setDrafts((p) => ({ ...p, [t.name]: { ...d, body_html: e.target.value } }))}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetTemplate(t.name)}
                    disabled={!overrides[t.name]}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                  <Button size="sm" onClick={() => saveTemplate(t.name)} disabled={savingTemplate === t.name}>
                    {savingTemplate === t.name ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* AI agent scaffold */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> AI Customer Service Agent
            <Badge variant="outline">Not wired</Badge>
          </CardTitle>
          <CardDescription>
            Scaffolded space for an AI agent that will triage and reply to inbound customer emails. Configuration controls below are inert.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 opacity-60 pointer-events-none">
          <div className="space-y-2">
            <Label>System prompt</Label>
            <Textarea rows={4} placeholder="You are a warm, knowledgeable Rescue Dog Wines customer service agent..." />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Auto-reply confidence threshold</Label>
              <Input placeholder="0.85" />
            </div>
            <div className="space-y-2">
              <Label>Escalation email</Label>
              <Input placeholder="info@rescuedogwines.com" />
            </div>
          </div>
          <div className="flex items-center justify-between border border-border rounded p-3">
            <div>
              <p className="text-sm font-medium">Enable AI auto-reply</p>
              <p className="text-xs text-muted-foreground">Drafts only until wiring is complete.</p>
            </div>
            <Switch checked={false} />
          </div>
          <Button disabled>Save AI settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}