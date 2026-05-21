import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2, Sparkles, Check, X, ImageIcon, RefreshCw } from "lucide-react";

type AssetType = "hero" | "pdp" | "banner" | "ad_creative";
type BrandLockup = "wine" | "merch";
type Status =
  | "pending" | "generating" | "ready"
  | "approved" | "rejected" | "live" | "error";

type QueueRow = {
  id: string;
  asset_type: AssetType;
  brand_lockup: BrandLockup;
  aspect_ratio: string;
  status: Status;
  prompt: string;
  generated_url: string | null;
  notes: string | null;
  error: string | null;
  target_slot: string | null;
  approved_at: string | null;
  approved_by: string | null;
  requested_by: string | null;
  created_at: string;
};

const ASPECT_DEFAULT: Record<AssetType, string> = {
  hero: "16:9",
  pdp: "4:5",
  banner: "16:9",
  ad_creative: "1:1",
};

const STATUS_COLORS: Record<Status, string> = {
  pending: "bg-muted text-muted-foreground",
  generating: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  ready: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  live: "bg-primary text-primary-foreground",
  error: "bg-destructive/10 text-destructive border-destructive/30",
};

export function CreativeQueuePanel() {
  const { toast } = useToast();
  const { data: roleInfo } = useUserRole();
  const canApprove = !!roleInfo?.isAdminOrOwner; // Blair-only

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // form
  const [assetType, setAssetType] = useState<AssetType>("hero");
  const [brand, setBrand] = useState<BrandLockup>("wine");
  const [prompt, setPrompt] = useState("");
  const [targetSlot, setTargetSlot] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("creative_asset_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: "Failed to load queue", description: error.message, variant: "destructive" });
    }
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // poll while any item is generating
  const anyGenerating = useMemo(
    () => rows.some((r) => r.status === "generating" || r.status === "pending"),
    [rows]
  );
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyGenerating]);

  async function generate() {
    if (!prompt.trim()) {
      toast({ title: "Add a brief", description: "Describe the creative." });
      return;
    }
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data: insert, error: insertErr } = await supabase
        .from("creative_asset_queue")
        .insert({
          asset_type: assetType,
          brand_lockup: brand,
          aspect_ratio: ASPECT_DEFAULT[assetType],
          prompt: prompt.trim(),
          target_slot: targetSlot.trim() || null,
          requested_by: userId,
          status: "pending",
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const { error: fnErr } = await supabase.functions.invoke("capi-creative-gen", {
        body: { queue_id: insert.id },
      });
      if (fnErr) throw fnErr;

      toast({ title: "Generation queued", description: "Image will appear in the review queue shortly." });
      setPrompt("");
      setTargetSlot("");
      load();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function regenerate(row: QueueRow) {
    await supabase
      .from("creative_asset_queue")
      .update({ status: "pending", error: null })
      .eq("id", row.id);
    const { error } = await supabase.functions.invoke("capi-creative-gen", {
      body: { queue_id: row.id },
    });
    if (error) toast({ title: "Regenerate failed", description: error.message, variant: "destructive" });
    load();
  }

  async function decide(row: QueueRow, action: "approved" | "rejected") {
    if (!canApprove) {
      toast({ title: "Approval restricted", description: "Only Blair can approve or reject creative." });
      return;
    }
    const notes = action === "rejected"
      ? (window.prompt("Reason for rejection (optional):") ?? "") || null
      : null;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("creative_asset_queue")
      .update({
        status: action,
        approved_by: userData.user?.id ?? null,
        approved_at: new Date().toISOString(),
        notes,
      })
      .eq("id", row.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else toast({ title: action === "approved" ? "Approved" : "Rejected" });
    load();
  }

  const review = rows.filter((r) => ["ready", "approved", "rejected", "live"].includes(r.status));
  const inFlight = rows.filter((r) => ["pending", "generating", "error"].includes(r.status));

  return (
    <div className="space-y-8">
      {/* Content seed library — reference uploads */}
      <ContentSeedPanel />

      {/* Generator */}
      <Card className="p-6 border border-border rounded-none">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-bold">Generate Creative</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Asset type</Label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="w-full border border-border bg-background px-3 py-2 text-sm rounded-none"
            >
              <option value="hero">Hero (16:9)</option>
              <option value="pdp">PDP (4:5)</option>
              <option value="banner">Banner (16:9)</option>
              <option value="ad_creative">Ad creative (1:1)</option>
            </select>
          </div>
          <div>
            <Label>Brand lockup</Label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value as BrandLockup)}
              className="w-full border border-border bg-background px-3 py-2 text-sm rounded-none"
            >
              <option value="wine">Wine (Black RDW)</option>
              <option value="merch">Merch (high-def Rescue Dog)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Target CMS slot (optional)</Label>
            <Input
              value={targetSlot}
              onChange={(e) => setTargetSlot(e.target.value)}
              placeholder="e.g. homepage_hero, pdp_red_blend, cart_banner"
              className="rounded-none"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Creative brief</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene, mood, subjects. Brand guardrails (color, no text, mission-led) are applied automatically."
              rows={4}
              className="rounded-none"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={generate} disabled={submitting} className="rounded-none">
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate
          </Button>
        </div>
      </Card>

      {/* In-flight */}
      {inFlight.length > 0 && (
        <div>
          <h3 className="font-bold mb-3">In progress</h3>
          <div className="space-y-2">
            {inFlight.map((r) => (
              <Card key={r.id} className="p-4 flex items-center gap-3 rounded-none border border-border">
                <Badge variant="outline" className={`rounded-none ${STATUS_COLORS[r.status]}`}>{r.status}</Badge>
                <span className="text-sm text-muted-foreground flex-1 truncate">{r.prompt}</span>
                {r.status === "error" && (
                  <Button size="sm" variant="outline" onClick={() => regenerate(r)} className="rounded-none">
                    <RefreshCw className="h-3 w-3 mr-1" /> Retry
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Review queue */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Creative Queue</h3>
          <Button variant="ghost" size="sm" onClick={load} className="rounded-none">
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Loading…</div>
        ) : review.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 border border-dashed border-border">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No creative ready for review yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {review.map((r) => (
              <Card key={r.id} className="overflow-hidden rounded-none border border-border">
                {r.generated_url ? (
                  <a href={r.generated_url} target="_blank" rel="noreferrer">
                    <img src={r.generated_url} alt={r.prompt} className="w-full aspect-square object-cover bg-muted" />
                  </a>
                ) : (
                  <div className="w-full aspect-square bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`rounded-none ${STATUS_COLORS[r.status]}`}>{r.status}</Badge>
                    <Badge variant="outline" className="rounded-none">{r.asset_type}</Badge>
                    <Badge variant="outline" className="rounded-none">{r.brand_lockup}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{r.prompt}</p>
                  {r.target_slot && (
                    <p className="text-[11px] text-muted-foreground">→ slot: <code>{r.target_slot}</code></p>
                  )}
                  {r.notes && r.status === "rejected" && (
                    <p className="text-[11px] text-destructive">Note: {r.notes}</p>
                  )}
                  {r.status === "ready" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 rounded-none"
                        disabled={!canApprove}
                        onClick={() => decide(r, "approved")}
                      >
                        <Check className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 rounded-none"
                        disabled={!canApprove}
                        onClick={() => decide(r, "rejected")}
                      >
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                  {r.status === "ready" && !canApprove && (
                    <p className="text-[11px] text-muted-foreground italic">Awaiting Blair's approval.</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}