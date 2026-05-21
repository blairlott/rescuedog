import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Plus, Save, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES: Array<{ key: string; title: string; subtitle: string }> = [
  { key: "rpm_off_platform", title: "RPM — Off-Platform Activation", subtitle: "Meta, TTD, Roku/CTV, YouTube, TikTok, Pinterest + closed-loop measurement." },
  { key: "cla", title: "Meta Collaborative Ads (CLA)", subtitle: "Co-funded campaigns, catalog sharing, retailer-level reporting." },
  { key: "on_platform", title: "On-Platform — Expansion", subtitle: "Brand Pages, display, 2026 placements, search/browse, curated moments." },
  { key: "data_audiences", title: "Data & Audience Tools", subtitle: "1P segments, NTB, overlap analysis, custom audiences from our list." },
  { key: "api_programmatic", title: "API / Programmatic Access", subtitle: "Advertiser API write, Reporting → BigQuery, creative + bid via API." },
  { key: "alcohol_compliance", title: "Alcohol Category — Compliance", subtitle: "Eligibility maps, CTV state rules, 21+ verification, creative gates." },
  { key: "commercial", title: "Account / Commercial", subtitle: "Minimums, managed-vs-self-serve, case studies, 2026 roadmap." },
];

const STATUS_OPTIONS = [
  { value: "requested", label: "Requested", variant: "secondary" as const },
  { value: "in_progress", label: "In progress", variant: "default" as const },
  { value: "confirmed", label: "Confirmed", variant: "default" as const },
  { value: "live", label: "Live", variant: "default" as const },
  { value: "blocked", label: "Blocked", variant: "destructive" as const },
  { value: "declined", label: "Declined", variant: "destructive" as const },
];

type Item = {
  id: string;
  category: string;
  label: string;
  description: string | null;
  ask: string | null;
  answer: string | null;
  owner: string | null;
  status: string;
  follow_up_date: string | null;
  external_url: string | null;
  sort_order: number;
};

export function InstacartPartnershipPlanner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
  );
  const [drafts, setDrafts] = useState<Record<string, Partial<Item>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["instacart-partnership-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instacart_partnership_items" as any)
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]) as Item[];
    },
  });

  const byCategory = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const c of CATEGORIES) map[c.key] = [];
    for (const it of items) {
      (map[it.category] ||= []).push(it);
    }
    return map;
  }, [items]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of STATUS_OPTIONS) out[s.value] = items.filter((i) => i.status === s.value).length;
    return out;
  }, [items]);

  function setDraft(id: string, patch: Partial<Item>) {
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
  }

  async function saveItem(item: Item) {
    const draft = drafts[item.id] ?? {};
    if (Object.keys(draft).length === 0) return;
    setSavingId(item.id);
    const { error } = await supabase
      .from("instacart_partnership_items" as any)
      .update(draft)
      .eq("id", item.id);
    setSavingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setDrafts((p) => { const c = { ...p }; delete c[item.id]; return c; });
    qc.invalidateQueries({ queryKey: ["instacart-partnership-items"] });
  }

  async function quickStatus(item: Item, status: string) {
    const { error } = await supabase
      .from("instacart_partnership_items" as any)
      .update({ status })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["instacart-partnership-items"] });
  }

  async function addItem(category: string) {
    const label = prompt("New item label");
    if (!label) return;
    const max = byCategory[category]?.reduce((m, x) => Math.max(m, x.sort_order), 0) ?? 0;
    const { error } = await supabase
      .from("instacart_partnership_items" as any)
      .insert({ category, label, sort_order: max + 10 });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["instacart-partnership-items"] });
  }

  function printAgenda() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm uppercase tracking-brand">Instacart RPM & Partnership Planner</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Full meeting agenda pre-loaded. Update status / capture answers / assign owners as the conversation happens.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {STATUS_OPTIONS.map((s) => (
                <Badge key={s.value} variant={s.variant} className="text-[10px]">
                  {s.label}: {counts[s.value] ?? 0}
                </Badge>
              ))}
              <Button size="sm" variant="outline" onClick={printAgenda}>
                <Printer className="h-3 w-3 mr-1" /> Print agenda
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Loading planner…</p>}

      {CATEGORIES.map((cat) => {
        const list = byCategory[cat.key] ?? [];
        const isOpen = !!open[cat.key];
        return (
          <Card key={cat.key}>
            <CardHeader className="cursor-pointer pb-2" onClick={() => setOpen((p) => ({ ...p, [cat.key]: !isOpen }))}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <CardTitle className="text-sm uppercase tracking-brand">{cat.title}</CardTitle>
                  <Badge variant="outline">{list.length}</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); addItem(cat.key); }}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground ml-6">{cat.subtitle}</p>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-3">
                {list.length === 0 && <p className="text-xs text-muted-foreground">No items yet.</p>}
                {list.map((it) => {
                  const d = drafts[it.id] ?? {};
                  const merged = { ...it, ...d };
                  const statusOpt = STATUS_OPTIONS.find((s) => s.value === merged.status) ?? STATUS_OPTIONS[0];
                  const dirty = Object.keys(d).length > 0;
                  return (
                    <div key={it.id} className="border border-border rounded p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-[260px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-sm">{it.label}</h4>
                            <Badge variant={statusOpt.variant} className="text-[10px]">{statusOpt.label}</Badge>
                          </div>
                          {it.description && <p className="text-xs text-muted-foreground mt-0.5">{it.description}</p>}
                          {it.ask && <p className="text-xs mt-1"><span className="text-muted-foreground">Ask:</span> {it.ask}</p>}
                        </div>
                        <Select value={merged.status} onValueChange={(v) => quickStatus(it, v)}>
                          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">IC owner</label>
                          <Input
                            placeholder="Name @ Instacart"
                            value={merged.owner ?? ""}
                            onChange={(e) => setDraft(it.id, { owner: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Follow-up</label>
                          <Input
                            type="date"
                            value={merged.follow_up_date ?? ""}
                            onChange={(e) => setDraft(it.id, { follow_up_date: e.target.value || null })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Link</label>
                          <Input
                            placeholder="https://…"
                            value={merged.external_url ?? ""}
                            onChange={(e) => setDraft(it.id, { external_url: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Instacart's answer / notes</label>
                        <Textarea
                          rows={2}
                          placeholder="What did they say? Any commitments, dates, contacts?"
                          value={merged.answer ?? ""}
                          onChange={(e) => setDraft(it.id, { answer: e.target.value })}
                          className="text-xs"
                        />
                      </div>

                      {dirty && (
                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => saveItem(it)} disabled={savingId === it.id}>
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}