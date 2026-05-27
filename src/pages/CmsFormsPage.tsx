import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

type Row = {
  id: string;
  form_name: string;
  page_path: string | null;
  trigger_event: string;
  audience: "customer" | "team" | "partner";
  recipient: string;
  template_name: string | null;
  notes: string | null;
  test_mode_exempt: boolean;
  active: boolean;
  sort_order: number;
};

type TestMode = {
  enabled: boolean;
  recipients: string[];
  exempt_templates: string[];
  note?: string;
};

export default function CmsFormsPage() {
  const qc = useQueryClient();
  const [tm, setTm] = useState<TestMode | null>(null);
  const [tmDirty, setTmDirty] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["form-email-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("form_email_inventory")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const { data: tmRow } = useQuery({
    queryKey: ["email-test-mode"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "email_test_mode")
        .maybeSingle();
      if (error) throw error;
      return (data?.value || null) as TestMode | null;
    },
  });

  useEffect(() => {
    if (tmRow && !tm) setTm(tmRow);
  }, [tmRow, tm]);

  const saveTm = async () => {
    if (!tm) return;
    const { error } = await supabase
      .from("app_settings")
      .update({ value: tm as any })
      .eq("key", "email_test_mode");
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    setTmDirty(false);
    toast.success("Test mode settings saved");
    qc.invalidateQueries({ queryKey: ["email-test-mode"] });
  };

  const updateRow = async (id: string, patch: Partial<Row>) => {
    const { error } = await supabase
      .from("form_email_inventory")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["form-email-inventory"] });
  };

  return (
    <>
      <Seo noindex title="Cms Forms" />
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center gap-4">
          <Link to="/cms" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> CMS
          </Link>
          <h1 className="text-xl font-semibold">Forms & Email Routing</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">
        {/* Test mode card */}
        <section className="border border-border rounded-none p-6 bg-card">
          <div className="flex items-start justify-between gap-6 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#c30017]" />
                <h2 className="text-lg font-semibold">Pre-Launch Email Test Mode</h2>
              </div>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                When ON, every form-triggered email is routed only to the recipients below.
                Customer-facing and team-facing sends are intercepted. Subscribe &amp; Save
                templates listed under "Exempt" still send normally.
              </p>
            </div>
            {tm && (
              <div className="flex items-center gap-3 shrink-0">
                <Label htmlFor="tm-toggle" className="text-sm">{tm.enabled ? "Test mode ON" : "Test mode OFF"}</Label>
                <Switch
                  id="tm-toggle"
                  checked={tm.enabled}
                  onCheckedChange={(v) => { setTm({ ...tm, enabled: v }); setTmDirty(true); }}
                />
              </div>
            )}
          </div>

          {tm && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wide">Recipients (one per line)</Label>
                <Textarea
                  rows={4}
                  value={tm.recipients.join("\n")}
                  onChange={(e) => { setTm({ ...tm, recipients: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }); setTmDirty(true); }}
                  className="mt-1 font-mono text-sm rounded-none"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide">Exempt templates (S&amp;S — send normally)</Label>
                <Textarea
                  rows={4}
                  value={tm.exempt_templates.join("\n")}
                  onChange={(e) => { setTm({ ...tm, exempt_templates: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }); setTmDirty(true); }}
                  className="mt-1 font-mono text-sm rounded-none"
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={saveTm} disabled={!tmDirty} className="rounded-none">
              <Save className="h-4 w-4 mr-2" /> Save test mode settings
            </Button>
          </div>
        </section>

        {/* Inventory table */}
        <section className="border border-border rounded-none bg-card">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold">Form Email Inventory</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Every form on the site and the emails it triggers. Edit recipient, template, or notes inline.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left bg-muted/40">
                <tr>
                  <th className="px-4 py-2 font-semibold">Form</th>
                  <th className="px-4 py-2 font-semibold">Trigger</th>
                  <th className="px-4 py-2 font-semibold">Audience</th>
                  <th className="px-4 py-2 font-semibold">Recipient</th>
                  <th className="px-4 py-2 font-semibold">Template</th>
                  <th className="px-4 py-2 font-semibold">S&amp;S exempt</th>
                  <th className="px-4 py-2 font-semibold">Active</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.form_name}</div>
                      <div className="text-xs text-muted-foreground">{r.page_path || "—"}</div>
                      {r.notes && <div className="text-xs text-muted-foreground mt-1 max-w-xs">{r.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">{r.trigger_event}</td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wide">{r.audience}</td>
                    <td className="px-4 py-3">
                      <Input
                        defaultValue={r.recipient}
                        onBlur={(e) => e.target.value !== r.recipient && updateRow(r.id, { recipient: e.target.value })}
                        className="h-8 text-xs rounded-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        defaultValue={r.template_name || ""}
                        onBlur={(e) => e.target.value !== (r.template_name || "") && updateRow(r.id, { template_name: e.target.value || null })}
                        className="h-8 text-xs font-mono rounded-none"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={r.test_mode_exempt} onCheckedChange={(v) => updateRow(r.id, { test_mode_exempt: v })} />
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={r.active} onCheckedChange={(v) => updateRow(r.id, { active: v })} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No forms inventoried yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}