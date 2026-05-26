import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCmsAuth } from "@/hooks/useCmsAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Surface = "wine" | "merch";
type Status = "active" | "paused" | "retired";

type HeroVariant = {
  id: string;
  surface: Surface;
  image_url: string;
  image_alt: string;
  eyebrow: string;
  headline_html: string;
  sub: string;
  cta_label: string;
  cta_href: string;
  status: Status;
  sticky: boolean;
  auto_generated: boolean;
  created_at: string;
};

type Stat = { variant_id: string; impressions: number; clicks: number; orders: number; revenue: number };

function CmsHeroesPage() {
  const { isCmsEditor, loading } = useCmsAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isCmsEditor) navigate("/cms/login");
  }, [loading, isCmsEditor, navigate]);

  // Scroll to #wine or #merch on load when linked from the CMS dashboard
  useEffect(() => {
    if (loading || !isCmsEditor) return;
    const hash = window.location.hash.replace("#", "");
    if (hash === "wine" || hash === "merch") {
      requestAnimationFrame(() => {
        document.getElementById(`hero-section-${hash}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [loading, isCmsEditor]);

  const { data: variants = [], isLoading } = useQuery({
    queryKey: ["hero-variants-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_variants")
        .select("*")
        .order("surface")
        .order("sticky", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as HeroVariant[];
    },
    enabled: isCmsEditor,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["hero-variant-stats-30"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_hero_variant_stats", { _days: 30 });
      if (error) throw error;
      return (data ?? []) as Stat[];
    },
    enabled: isCmsEditor,
  });
  const statById = useMemo(() => new Map(stats.map((s) => [s.variant_id, s])), [stats]);

  const updateVariant = useMutation({
    mutationFn: async (patch: Partial<HeroVariant> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("hero_variants").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero-variants-all"] }),
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteVariant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hero_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero-variants-all"] });
      toast({ title: "Variant deleted" });
    },
  });

  const generateNow = useMutation({
    mutationFn: async (surface: Surface) => {
      const { data, error } = await supabase.functions.invoke("hero-daily-rotation", {
        body: { surface },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero-variants-all"] });
      toast({ title: "New variant generated" });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const [generatingFor, setGeneratingFor] = useState<Surface | null>(null);

  if (loading || !isCmsEditor) {
    return <div className="min-h-dvh flex items-center justify-center"><Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /></div>;
  }

  const bySurface = (s: Surface) => variants.filter((v) => v.surface === s);

  return (
    <div className="min-h-dvh bg-secondary">
      <header className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Hero Variants</h1>
            <p className="text-xs text-muted-foreground">Manage homepage and /merch hero images and copy. Winners go sticky automatically.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/cms"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> CMS</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {(["wine", "merch"] as Surface[]).map((surface) => (
          <section key={surface} id={`hero-section-${surface}`} className="scroll-mt-24">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase tracking-brand">
                {surface === "wine" ? "Main Header — Homepage (Wine)" : "Merch Header — /merch"}
              </h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={generateNow.isPending && generatingFor === surface}
                  onClick={() => {
                    setGeneratingFor(surface);
                    generateNow.mutate(surface, { onSettled: () => setGeneratingFor(null) });
                  }}
                >
                  {generateNow.isPending && generatingFor === surface
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Generate new variant</>}
                </Button>
                <NewVariantButton surface={surface} onCreated={() => qc.invalidateQueries({ queryKey: ["hero-variants-all"] })} />
              </div>
            </div>

            {isLoading ? (
              <div className="text-center text-muted-foreground py-8">Loading…</div>
            ) : bySurface(surface).length === 0 ? (
              <div className="text-center text-muted-foreground py-8 bg-background border border-border">No variants yet.</div>
            ) : (
              <div className="grid gap-4">
                {bySurface(surface).map((v) => {
                  const s = statById.get(v.id);
                  const ctr = s && s.impressions > 0 ? (s.clicks / s.impressions) * 100 : 0;
                  return (
                    <VariantCard
                      key={v.id}
                      variant={v}
                      stat={s}
                      ctr={ctr}
                      onSave={(patch) => updateVariant.mutate({ id: v.id, ...patch })}
                      onDelete={() => deleteVariant.mutate(v.id)}
                      isSaving={updateVariant.isPending}
                    />
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

function NewVariantButton({ surface, onCreated }: { surface: Surface; onCreated: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const path = `${surface}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const up = await supabase.storage.from("hero-images").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("hero-images").getPublicUrl(path);
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("hero_variants").insert({
        surface,
        image_url: pub.publicUrl,
        image_alt: "",
        eyebrow: "",
        headline_html: "",
        sub: "",
        cta_label: surface === "wine" ? "Shop Wines" : "Shop Merch",
        cta_href: surface === "wine" ? "/wines" : "/merch#products",
        created_by: user.user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Variant added — fill in copy below." });
      onCreated();
    } catch (e: any) {
      toast({ title: "Upload failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
        Upload image
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </>
  );
}

function VariantCard({
  variant,
  stat,
  ctr,
  onSave,
  onDelete,
  isSaving,
}: {
  variant: HeroVariant;
  stat?: Stat;
  ctr: number;
  onSave: (patch: Partial<HeroVariant>) => void;
  onDelete: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    image_alt: variant.image_alt,
    eyebrow: variant.eyebrow,
    headline_html: variant.headline_html,
    sub: variant.sub,
    cta_label: variant.cta_label,
    cta_href: variant.cta_href,
  });
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const replaceImage = async (file: File) => {
    setUploading(true);
    try {
      const path = `${variant.surface}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const up = await supabase.storage.from("hero-images").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from("hero-images").getPublicUrl(path);
      onSave({ image_url: pub.publicUrl });
      toast({ title: "Image replaced" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="bg-background border border-border p-4 grid md:grid-cols-[200px_1fr] gap-4">
      <div className="space-y-2">
        <div className="aspect-video bg-muted overflow-hidden">
          {variant.image_url ? (
            <img src={variant.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No image</div>
          )}
        </div>
        <Button size="sm" variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          Replace
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceImage(f); }}
        />
        <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border">
          <div>Impr: {stat?.impressions ?? 0}</div>
          <div>Clicks: {stat?.clicks ?? 0}</div>
          <div>CTR: {ctr.toFixed(2)}%</div>
          <div>Orders: {stat?.orders ?? 0}</div>
          <div>Revenue: ${Number(stat?.revenue ?? 0).toFixed(0)}</div>
          <div>CVR: {stat && stat.clicks > 0 ? ((stat.orders / stat.clicks) * 100).toFixed(2) : "0.00"}%</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Label className="flex items-center gap-2 text-xs">
              <Switch checked={variant.sticky} onCheckedChange={(v) => onSave({ sticky: v })} /> Sticky
            </Label>
            <Select value={variant.status} onValueChange={(v) => onSave({ status: v as Status })}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
              </SelectContent>
            </Select>
            {variant.auto_generated && <span className="text-xs text-muted-foreground">auto</span>}
          </div>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Eyebrow</Label>
            <Input value={form.eyebrow} onChange={(e) => setForm({ ...form, eyebrow: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Image alt</Label>
            <Input value={form.image_alt} onChange={(e) => setForm({ ...form, image_alt: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Headline (HTML — use &lt;br/&gt; for line breaks)</Label>
            <Textarea rows={2} value={form.headline_html} onChange={(e) => setForm({ ...form, headline_html: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Sub-headline</Label>
            <Textarea rows={2} value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">CTA label</Label>
            <Input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">CTA href</Label>
            <Input value={form.cta_href} onChange={(e) => setForm({ ...form, cta_href: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={isSaving} onClick={() => onSave(form)}>Save copy</Button>
        </div>
      </div>
    </div>
  );
}

export default CmsHeroesPage;