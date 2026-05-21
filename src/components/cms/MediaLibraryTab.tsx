import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, RefreshCw, Image as ImageIcon, Sparkles, Maximize2, ChevronDown, ChevronRight, Globe, Instagram, Wand2 } from "lucide-react";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type MediaAsset = {
  id: string;
  source: string;
  image_url: string;
  source_url: string | null;
  alt_text: string | null;
  ai_score: number | null;
  ai_tags: string[];
  ai_subject: string | null;
  status: "pending" | "approved" | "rejected" | "archived";
  created_at: string;
  hero_eligible?: boolean;
  width?: number | null;
  height?: number | null;
};

type HarvestJob = {
  id: string;
  source: string;
  status: string;
  items_found: number;
  items_new: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export default function MediaLibraryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [scanning, setScanning] = useState<string | null>(null);
  const [enhanceFor, setEnhanceFor] = useState<MediaAsset | null>(null);
  const [enhancePreset, setEnhancePreset] = useState<string>("enhance");
  const [enhanceVariants, setEnhanceVariants] = useState<number>(1);
  const [enhanceVibes, setEnhanceVibes] = useState<string[]>([]);
  const [enhancing, setEnhancing] = useState(false);
  const [lightbox, setLightbox] = useState<MediaAsset | null>(null);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [syncingHero, setSyncingHero] = useState(false);
  const [heroResult, setHeroResult] = useState<{ eligible_count: number; status: string; hint?: string | null; skipped?: { reason: string }[] } | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["cms-media-assets", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("status", filter)
        .order("ai_score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MediaAsset[];
    },
  });

  const countsQuery = useQuery({
    queryKey: ["cms-media-counts"],
    queryFn: async () => {
      const statuses = ["pending", "approved", "rejected"] as const;
      const results = await Promise.all(statuses.map(async (s) => {
        const { count } = await supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("status", s);
        return [s, count ?? 0] as const;
      }));
      return Object.fromEntries(results) as Record<typeof statuses[number], number>;
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["cms-harvest-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("harvest_jobs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as HarvestJob[];
    },
    refetchInterval: scanning ? 3000 : false,
  });

  async function runScan(source: "legacy" | "instagram" | "all") {
    setScanning(source);
    try {
      const { error } = await supabase.functions.invoke("harvest-images", { body: { source } });
      if (error) throw error;
      toast({ title: "Scan started", description: `Harvesting ${source}. Refresh in a minute.` });
      qc.invalidateQueries({ queryKey: ["cms-harvest-jobs"] });
      qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setTimeout(() => setScanning(null), 4000);
    }
  }

  async function setStatus(id: string, status: "approved" | "rejected" | "archived" | "pending") {
    const { error } = await supabase
      .from("media_assets")
      .update({ status, approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
    qc.invalidateQueries({ queryKey: ["cms-media-counts"] });
  }

  async function toggleHero(asset: MediaAsset) {
    const next = !asset.hero_eligible;
    const { error } = await supabase
      .from("media_assets")
      .update({ hero_eligible: next })
      .eq("id", asset.id);
    if (error) {
      toast({ title: "Hero pool update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Added to hero rotation" : "Removed from hero rotation", description: next ? "Click ‘Sync hero pool’ to publish." : undefined });
    qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
  }

  async function syncHeroPool() {
    setSyncingHero(true);
    setHeroResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-hero-pool", { body: {} });
      if (error) throw error;
      setHeroResult(data as typeof heroResult);
      toast({ title: "Hero pool synced", description: `${(data as { eligible_count: number }).eligible_count} image(s) now in rotation.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Sync failed", description: msg, variant: "destructive" });
    } finally {
      setSyncingHero(false);
    }
  }

  async function runEnhance() {
    if (!enhanceFor) return;
    setEnhancing(true);
    try {
      const vibeText = enhanceVibes.length > 0 ? ` Make it feel: ${enhanceVibes.join(", ")}.` : "";
      const { data, error } = await supabase.functions.invoke("enhance-image", {
        body: {
          asset_id: enhanceFor.id,
          preset: enhancePreset,
          extra_vibes: enhanceVibes,
          custom_prompt: vibeText ? undefined : undefined,
          variants: enhanceVariants,
        },
      });
      if (error) throw error;
      const count = (data as { results?: unknown[] })?.results?.length ?? 0;
      toast({ title: "Enhanced", description: `${count} variant(s) queued in Pending.` });
      setEnhanceFor(null);
      setEnhanceVibes([]);
      setFilter("pending");
      qc.invalidateQueries({ queryKey: ["cms-media-assets"] });
      qc.invalidateQueries({ queryKey: ["cms-media-counts"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Enhance failed", description: msg, variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  }

  const STYLE_OPTIONS = [
    { value: "enhance", label: "Make it sharper & cleaner", help: "Fix blur, noise, and dull colors. Keeps everything the same." },
    { value: "hero", label: "Turn it into a hero banner", help: "Cinematic lighting, warm tones, wide framing." },
    { value: "square", label: "Crop for social (square)", help: "Reframe to 1:1 for Instagram posts." },
    { value: "background", label: "Swap the background", help: "Keep the subject, replace what's behind." },
  ] as const;

  const VIBE_WORDS = [
    "warmer", "brighter", "moody", "cozy", "rustic",
    "vineyard", "sunset", "golden hour", "minimal", "playful",
  ];

  function toggleVibe(word: string) {
    setEnhanceVibes((prev) => prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]);
  }

  const counts = countsQuery.data ?? { pending: 0, approved: 0, rejected: 0 };
  const filterLabels: Record<typeof filter, { label: string; help: string }> = {
    pending: { label: "Needs review", help: "New images waiting for your approval. Approve to use, reject to discard." },
    approved: { label: "Approved", help: "Ready to use across the site. Click Enhance to generate AI variants." },
    rejected: { label: "Rejected", help: "Hidden from use. Restore to send back to review." },
  };

  function sourceBadge(source: string) {
    if (source === "legacy_site") return { icon: Globe, label: "Website" };
    if (source === "instagram") return { icon: Instagram, label: "Instagram" };
    if (source === "ai_enhanced") return { icon: Wand2, label: "AI variant" };
    return { icon: ImageIcon, label: source };
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Pull images in */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-sm">1. Pull in new images</h3>
            <p className="text-xs text-muted-foreground mt-1">Scan your website and Instagram. New finds appear in <strong>Needs review</strong> below.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => runScan("legacy")} disabled={!!scanning} size="sm" variant="outline">
              {scanning === "legacy" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
              rescuedogwines.com
            </Button>
            <Button onClick={() => runScan("instagram")} disabled={!!scanning} size="sm" variant="outline">
              {scanning === "instagram" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Instagram className="h-4 w-4 mr-2" />}
              Instagram
            </Button>
            <Button onClick={() => runScan("all")} disabled={!!scanning} size="sm">
              {scanning === "all" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Scan all
            </Button>
          </div>

          <button onClick={() => setJobsOpen((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {jobsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Recent scans ({(jobsQuery.data ?? []).length})
          </button>
          {jobsOpen && (
            <ul className="space-y-1 text-xs text-muted-foreground pl-4">
              {(jobsQuery.data ?? []).map((j) => (
                <li key={j.id} className="flex items-center gap-2 flex-wrap">
                  <span>{new Date(j.started_at).toLocaleString()}</span>
                  <span>·</span>
                  <span>{j.source}</span>
                  <Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{j.status}</Badge>
                  <span>{j.items_new} new / {j.items_found} found</span>
                  {j.error && <span className="text-destructive">— {j.error.slice(0, 80)}</span>}
                </li>
              ))}
              {(jobsQuery.data ?? []).length === 0 && <li className="italic">No scans yet.</li>}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Hero rotation control */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2"><Star className="h-4 w-4" /> Homepage hero rotation</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Star approved images to add them to the homepage hero pool. We auto-filter to landscape ≥1280w and run a bandit that rotates them — frequently at first, then settling on the highest converters (Shop Wines + Wine Club CTAs).
              </p>
            </div>
            <Button onClick={syncHeroPool} disabled={syncingHero} size="sm">
              {syncingHero ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync hero pool
            </Button>
          </div>
          {heroResult && (
            <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
              <div><strong>{heroResult.eligible_count}</strong> in rotation · experiment <strong>{heroResult.status}</strong></div>
              {heroResult.hint && <div className="text-amber-700">{heroResult.hint}</div>}
              {heroResult.skipped && heroResult.skipped.length > 0 && (
                <div>Skipped {heroResult.skipped.length}: {Array.from(new Set(heroResult.skipped.map((s) => s.reason))).join(", ")}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Review */}
      <div>
        <h3 className="font-semibold text-sm mb-2">2. Review & approve</h3>
        <div className="flex gap-2 border-b">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                filter === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {filterLabels[s].label}
              <Badge variant={filter === s ? "default" : "secondary"} className="text-[10px]">{counts[s]}</Badge>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{filterLabels[filter].help}</p>
      </div>

      {assetsQuery.isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (assetsQuery.data ?? []).length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No images in <strong>{filterLabels[filter].label.toLowerCase()}</strong>.</p>
          {filter === "pending" && <p className="text-xs mt-1">Run a scan above to harvest new images.</p>}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(assetsQuery.data ?? []).map((a) => {
            const src = sourceBadge(a.source);
            const SrcIcon = src.icon;
            return (
              <Card key={a.id} className="overflow-hidden group flex flex-col">
                <button
                  type="button"
                  onClick={() => setLightbox(a)}
                  className="relative aspect-square bg-muted overflow-hidden block w-full"
                  aria-label="View larger"
                >
                  <img
                    src={a.image_url}
                    alt={a.alt_text ?? ""}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                  />
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-medium">
                    <SrcIcon className="h-3 w-3" />
                    {src.label}
                  </div>
                  {a.ai_score !== null && (
                    <div className="absolute top-1.5 right-1.5 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-mono font-semibold">
                      {Math.round(a.ai_score)}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Maximize2 className="h-5 w-5 text-background" />
                  </div>
                </button>
                <CardContent className="p-2 space-y-2 flex-1 flex flex-col">
                  {a.alt_text && <p className="text-[11px] line-clamp-2 text-muted-foreground flex-1">{a.alt_text}</p>}
                  {filter === "pending" && (
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => setStatus(a.id, "approved")} title="Approve">
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setStatus(a.id, "rejected")} title="Reject">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {filter === "approved" && (
                    <div className="flex gap-1">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => { setEnhanceFor(a); setEnhanceVibes([]); setEnhancePreset("enhance"); setEnhanceVariants(1); }}>
                        <Sparkles className="h-3 w-3 mr-1" /> Enhance
                      </Button>
                      <Button
                        size="sm"
                        variant={a.hero_eligible ? "default" : "outline"}
                        className="h-7 text-xs px-2"
                        onClick={() => toggleHero(a)}
                        title={a.hero_eligible ? "In hero rotation — click to remove" : "Add to homepage hero rotation"}
                      >
                        <Star className={`h-3 w-3 ${a.hero_eligible ? "fill-current" : ""}`} />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(a.id, "archived")} title="Archive">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {filter === "rejected" && (
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setStatus(a.id, "pending")}>
                      Restore
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {lightbox && (
            <div className="bg-black flex items-center justify-center">
              <img src={lightbox.image_url} alt={lightbox.alt_text ?? ""} className="max-h-[80vh] w-auto object-contain" />
            </div>
          )}
          {lightbox && (
            <div className="p-4 space-y-2">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{sourceBadge(lightbox.source).label}</Badge>
                {lightbox.ai_subject && <Badge variant="secondary">{lightbox.ai_subject}</Badge>}
                {lightbox.ai_score !== null && <Badge>Score {Math.round(lightbox.ai_score)}</Badge>}
                {lightbox.ai_tags?.slice(0, 6).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
              </div>
              {lightbox.alt_text && <p className="text-sm text-muted-foreground">{lightbox.alt_text}</p>}
              {lightbox.source_url && (
                <a href={lightbox.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline break-all">
                  Source: {lightbox.source_url}
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!enhanceFor} onOpenChange={(o) => !o && setEnhanceFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Enhance with AI</DialogTitle>
          </DialogHeader>
          {enhanceFor && (
            <div className="space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-[120px_1fr] gap-3 items-start">
                <img src={enhanceFor.image_url} alt="" className="w-full aspect-square object-cover bg-muted" />
                <p className="text-xs text-muted-foreground">
                  AI will generate new variants based on this image. Variants land back in <strong>Needs review</strong> for approval.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">What do you want to do?</p>
                <RadioGroup value={enhancePreset} onValueChange={setEnhancePreset} className="space-y-2">
                  {STYLE_OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`style-${opt.value}`}
                      className={`flex items-start gap-3 border p-3 cursor-pointer transition-colors ${
                        enhancePreset === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value={opt.value} id={`style-${opt.value}`} className="mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.help}</div>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Pick a vibe <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
                <div className="flex flex-wrap gap-2">
                  {VIBE_WORDS.map((w) => {
                    const active = enhanceVibes.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => toggleVibe(w)}
                        className={`px-3 py-1.5 text-xs border transition-colors ${
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                        }`}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">How many options?</p>
                <RadioGroup
                  value={String(enhanceVariants)}
                  onValueChange={(v) => setEnhanceVariants(Number(v))}
                  className="grid grid-cols-4 gap-2"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <Label
                      key={n}
                      htmlFor={`var-${n}`}
                      className={`flex flex-col items-center gap-1 border p-2 cursor-pointer transition-colors ${
                        enhanceVariants === n ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <RadioGroupItem value={String(n)} id={`var-${n}`} className="sr-only" />
                      <span className="text-lg font-bold">{n}</span>
                      <span className="text-[10px] text-muted-foreground">{n === 1 ? "fastest" : n === 4 ? "most" : ""}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnhanceFor(null)} disabled={enhancing}>Cancel</Button>
            <Button onClick={runEnhance} disabled={enhancing}>
              {enhancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate variants
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}