import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Star, StarOff, Pencil, Save, X } from "lucide-react";

type Row = {
  id: string;
  name: string;
  city: string;
  state: string;
  url: string;
  photo_url: string | null;
  mission_blurb: string | null;
  is_active: boolean;
  is_focus: boolean;
};

const FOCUS_STATES = ["CA", "GA"] as const;

export function RescueSpotlightPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"focus" | "all">("focus");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Row>>({});
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["cms-rescue-partners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rescue_partners")
        .select("id, name, city, state, url, photo_url, mission_blurb, is_active, is_focus")
        .order("state")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Row> }) => {
      const { error } = await supabase.from("rescue_partners").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cms-rescue-partners"] });
      qc.invalidateQueries({ queryKey: ["rescue-spotlight-pool"] });
      toast({ title: "Saved" });
      setEditingId(null);
      setDraft({});
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const rows = (data ?? []).filter((r) => {
    if (tab === "focus" && !FOCUS_STATES.includes(r.state as any)) return false;
    if (search && !`${r.name} ${r.city} ${r.state}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const focusCount = (data ?? []).filter((r) => r.is_focus && r.is_active).length;

  const startEdit = (r: Row) => {
    setEditingId(r.id);
    setDraft({
      mission_blurb: r.mission_blurb ?? "",
      photo_url: r.photo_url ?? "",
      url: r.url ?? "",
    });
  };

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-foreground">Rescue Spotlights</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Curate which rescue partners appear in the rotating spotlight on the shop page and cart drawer.
            Currently {focusCount} active in the rotation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-border">
            <button
              onClick={() => setTab("focus")}
              className={`px-3 py-1 text-xs uppercase tracking-brand font-bold ${tab === "focus" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >
              Focus regions (CA + GA)
            </button>
            <button
              onClick={() => setTab("all")}
              className={`px-3 py-1 text-xs uppercase tracking-brand font-bold border-l border-border ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            >
              All partners
            </button>
          </div>
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-40 text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No partners match.</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const isEditing = editingId === r.id;
            return (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">{r.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {[r.city, r.state].filter(Boolean).join(", ") || "—"}
                      </span>
                      {r.is_focus && r.is_active && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-brand font-bold bg-primary/10 text-primary px-1.5 py-0.5">
                          <Star className="h-3 w-3 fill-current" /> In rotation
                        </span>
                      )}
                      {!r.is_active && (
                        <span className="text-[10px] uppercase tracking-brand font-bold bg-muted text-muted-foreground px-1.5 py-0.5">
                          Inactive
                        </span>
                      )}
                    </div>
                    {!isEditing && r.mission_blurb && (
                      <p className="text-sm text-muted-foreground mt-1.5 leading-snug">{r.mission_blurb}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={r.is_focus}
                        onCheckedChange={(v) => update.mutate({ id: r.id, patch: { is_focus: v } })}
                      />
                      <span className="text-[11px] uppercase tracking-brand font-bold text-muted-foreground">Focus</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => update.mutate({ id: r.id, patch: { is_active: v } })}
                      />
                      <span className="text-[11px] uppercase tracking-brand font-bold text-muted-foreground">Active</span>
                    </div>
                    {!isEditing ? (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(r)} className="h-7 px-2">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-secondary/40 p-4">
                    <div className="md:col-span-2">
                      <Label className="text-xs">Mission blurb (1–2 sentences)</Label>
                      <Textarea
                        rows={2}
                        value={draft.mission_blurb ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, mission_blurb: e.target.value }))}
                        placeholder="e.g. Pairs senior dogs with foster homes across the Bay Area."
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Photo URL</Label>
                      <Input
                        value={draft.photo_url ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, photo_url: e.target.value }))}
                        placeholder="https://…"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Website</Label>
                      <Input
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                        placeholder="https://…"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft({}); }}>
                        <X className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => update.mutate({ id: r.id, patch: draft })}
                        disabled={update.isPending}
                      >
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}