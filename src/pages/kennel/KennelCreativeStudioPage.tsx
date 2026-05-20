import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, Sparkles, Image as ImageIcon, Film, Type, KeyRound, ExternalLink, Download } from "lucide-react";

const RATIOS: { id: string; label: string; group: string }[] = [
  { id: "1:1", label: "Meta Feed / Carrot / Instacart (1:1)", group: "Social" },
  { id: "4:5", label: "Meta Feed portrait (4:5)", group: "Social" },
  { id: "9:16", label: "Stories / Reels / TikTok / Shorts (9:16)", group: "Vertical" },
  { id: "2:3", label: "Pinterest (2:3)", group: "Social" },
  { id: "16:9", label: "YouTube / Email Hero (16:9)", group: "Video" },
  { id: "1.91:1", label: "Google Display / Link preview (1.91:1)", group: "Display" },
  { id: "21:9", label: "Web Hero ultra-wide (21:9)", group: "Display" },
  { id: "4:3", label: "OOH / Outdoor (4:3)", group: "OOH" },
];

const TONES = ["Mission", "Product", "Urgency", "Story"];

type OutputRow = {
  id: string;
  job_id: string;
  kind: "image" | "video" | "copy";
  ratio: string | null;
  url: string | null;
  status: "queued" | "running" | "done" | "error";
  error: string | null;
  meta: any;
  created_at: string;
};

async function callApi(action: string, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/creative-studio-api?action=${action}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
  return json;
}

export default function KennelCreativeStudioPage() {
  const [setupChecked, setSetupChecked] = useState(false);
  const [creatomateReady, setCreatomateReady] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [brand, setBrand] = useState<"wine" | "merch" | "none">("wine");
  const [ratios, setRatios] = useState<string[]>(["1:1", "9:16", "16:9"]);
  const [outputTypes, setOutputTypes] = useState({ images: true, copy: true, video: true });
  const [brief, setBrief] = useState("");
  const [tones, setTones] = useState<string[]>(["Mission", "Product"]);
  const [videoRatio, setVideoRatio] = useState("9:16");
  const [videoDuration, setVideoDuration] = useState(8);
  const [videoCaption, setVideoCaption] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<OutputRow[]>([]);
  const [working, setWorking] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await callApi("setup-check");
        setCreatomateReady(!!r.configured);
      } catch (e: any) {
        toast.error("Setup check failed: " + e.message);
      } finally {
        setSetupChecked(true);
      }
    })();
  }, []);

  async function saveKey() {
    if (!keyInput.trim()) return;
    setSavingKey(true);
    try {
      await callApi("save-key", { api_key: keyInput.trim() });
      setCreatomateReady(true);
      setKeyInput("");
      toast.success("Creatomate connected. Ken Burns video render is live.");
    } catch (e: any) {
      toast.error("Could not save key: " + e.message);
    } finally {
      setSavingKey(false);
    }
  }

  function toggleRatio(r: string) {
    setRatios((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }
  function toggleTone(t: string) {
    setTones((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function onPickFile(f: File) {
    setFile(f);
    setSourceUrl(null);
  }

  async function uploadSource(): Promise<string | null> {
    if (!file) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in.");
      return null;
    }
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `sources/${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("creative-studio").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) {
      toast.error("Upload failed: " + error.message);
      return null;
    }
    const { data } = supabase.storage.from("creative-studio").getPublicUrl(path);
    setSourceUrl(data.publicUrl);
    return data.publicUrl;
  }

  async function refreshOutputs(jid: string) {
    const { data } = await supabase
      .from("creative_outputs")
      .select("*")
      .eq("job_id", jid)
      .order("created_at", { ascending: true });
    setOutputs((data ?? []) as OutputRow[]);
  }

  function startPolling(jid: string) {
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(async () => {
      await refreshOutputs(jid);
      // Poll any pending Creatomate videos
      const pendingVideos = (outputs ?? []).filter(
        (o) => o.kind === "video" && o.status === "running" && o.meta?.creatomate_id,
      );
      for (const v of pendingVideos) {
        try {
          await callApi("kenburns-poll", { output_id: v.id });
        } catch {}
      }
    }, 4000) as unknown as number;
  }

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  async function generate() {
    if (!file && !sourceUrl) {
      toast.error("Pick a source image first.");
      return;
    }
    setWorking(true);
    try {
      const src = sourceUrl ?? (await uploadSource());
      if (!src) {
        setWorking(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not signed in");

      const { data: job, error: je } = await supabase
        .from("creative_jobs")
        .insert({
          user_id: user.id,
          source_url: src,
          source_filename: file?.name ?? null,
          brand_lockup: brand,
          destinations: ratios,
          output_types: Object.entries(outputTypes).filter(([, v]) => v).map(([k]) => k),
          options: { brief, tones, videoRatio, videoDuration, videoCaption },
          status: "running",
        })
        .select()
        .single();
      if (je) throw je;
      setJobId(job.id);
      setOutputs([]);
      startPolling(job.id);
      toast.success("Job started. Generating in parallel…");

      const tasks: Promise<any>[] = [];
      if (outputTypes.images && ratios.length) {
        tasks.push(callApi("reformat", { job_id: job.id, ratios }));
      }
      if (outputTypes.copy) {
        tasks.push(callApi("copy-iterate", { job_id: job.id, brief, tones }));
      }
      if (outputTypes.video) {
        if (!creatomateReady) {
          toast.error("Add a Creatomate API key to render video.");
        } else {
          tasks.push(
            callApi("kenburns-render", {
              job_id: job.id,
              ratio: videoRatio,
              duration: videoDuration,
              caption: videoCaption || null,
              source_url: src,
            }),
          );
        }
      }
      await Promise.allSettled(tasks);
      await refreshOutputs(job.id);
      await supabase.from("creative_jobs").update({ status: "done" }).eq("id", job.id);
    } catch (e: any) {
      toast.error("Generation failed: " + e.message);
    } finally {
      setWorking(false);
    }
  }

  const previewUrl = useMemo(() => {
    if (sourceUrl) return sourceUrl;
    if (file) return URL.createObjectURL(file);
    return null;
  }, [file, sourceUrl]);

  const imageOutputs = outputs.filter((o) => o.kind === "image");
  const videoOutputs = outputs.filter((o) => o.kind === "video");
  const copyOutputs = outputs.filter((o) => o.kind === "copy");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6" /> Creative Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Upload one image → AI recompose for every platform, generate copy variants, and render a branded Ken Burns video.
          </p>
        </div>
      </div>

      {setupChecked && !creatomateReady && (
        <Card className="p-4 border-dashed">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 mt-0.5 text-primary" />
            <div className="flex-1 space-y-3">
              <div>
                <div className="font-medium">Connect Creatomate to enable Ken Burns video rendering</div>
                <p className="text-sm text-muted-foreground">
                  Lovable AI handles image reformat + copy iterations for free with your AI credits. Branded MP4 rendering uses{" "}
                  <a
                    href="https://creatomate.com/dashboard/projects?ref=rdw"
                    target="_blank"
                    rel="noreferrer"
                    className="underline inline-flex items-center gap-1"
                  >
                    Creatomate <ExternalLink className="h-3 w-3" />
                  </a>
                  . Grab your API key from Settings → API and paste below — it's stored encrypted in your integration credentials.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste Creatomate API key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  type="password"
                  className="max-w-md"
                />
                <Button onClick={saveKey} disabled={savingKey || !keyInput.trim()}>
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save key"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: setup */}
        <Card className="p-4 space-y-4 lg:col-span-1">
          <div>
            <Label className="text-sm font-medium">1. Source image</Label>
            <div className="mt-2 border-2 border-dashed rounded p-4 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
                className="hidden"
                id="src-file"
              />
              <label htmlFor="src-file" className="cursor-pointer">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="max-h-48 mx-auto" />
                ) : (
                  <div className="text-sm text-muted-foreground flex flex-col items-center gap-2 py-6">
                    <Upload className="h-6 w-6" />
                    Click to upload an image
                  </div>
                )}
              </label>
              {file && <div className="text-xs text-muted-foreground mt-2">{file.name}</div>}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">2. Brand lockup</Label>
            <div className="flex gap-2 mt-2">
              {(["wine", "merch"] as const).map((b) => (
                <Button
                  key={b}
                  variant={brand === b ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBrand(b)}
                >
                  {b === "wine" ? "Wine (Black RDW)" : "Merch (HD Rescue Dog)"}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">3. Image ratios</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {RATIOS.map((r) => (
                <Badge
                  key={r.id}
                  variant={ratios.includes(r.id) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleRatio(r.id)}
                >
                  {r.id}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">4. Output types</Label>
            <div className="space-y-1 mt-2 text-sm">
              {(
                [
                  ["images", "Reformatted images (AI recompose)", ImageIcon],
                  ["copy", "Copy / headline / CTA variants", Type],
                  ["video", "Ken Burns branded video (MP4)", Film],
                ] as const
              ).map(([k, label, Icon]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(outputTypes as any)[k]}
                    onChange={(e) => setOutputTypes((p) => ({ ...p, [k]: e.target.checked }))}
                  />
                  <Icon className="h-4 w-4" /> {label}
                </label>
              ))}
            </div>
          </div>

          {outputTypes.copy && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Copy brief & tones</Label>
              <Textarea
                rows={3}
                placeholder="What's this creative selling / saying? e.g. 'Spring Sampler 6-pack launch, ships in 2 days, mission-led story'."
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {TONES.map((t) => (
                  <Badge
                    key={t}
                    variant={tones.includes(t) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTone(t)}
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {outputTypes.video && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ken Burns video</Label>
              <div className="flex gap-2 flex-wrap">
                {["9:16", "1:1", "16:9", "4:5"].map((r) => (
                  <Badge
                    key={r}
                    variant={videoRatio === r ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setVideoRatio(r)}
                  >
                    {r}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 items-center text-sm">
                <Label>Duration</Label>
                {[5, 8, 10, 15].map((d) => (
                  <Badge
                    key={d}
                    variant={videoDuration === d ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setVideoDuration(d)}
                  >
                    {d}s
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Optional on-screen caption"
                value={videoCaption}
                onChange={(e) => setVideoCaption(e.target.value)}
              />
            </div>
          )}

          <Button onClick={generate} disabled={working || !file} className="w-full">
            {working ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate
          </Button>
        </Card>

        {/* Right: outputs */}
        <div className="lg:col-span-2 space-y-4">
          {!jobId && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Pick an image, choose outputs, hit Generate.
            </Card>
          )}

          {jobId && (
            <>
              {imageOutputs.length > 0 && (
                <Card className="p-4">
                  <div className="font-medium mb-3 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" /> Reformatted images
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {imageOutputs.map((o) => (
                      <div key={o.id} className="border rounded p-2 space-y-2">
                        <div className="text-xs flex items-center justify-between">
                          <Badge variant="outline">{o.ratio}</Badge>
                          {o.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {o.status === "error" && <span className="text-destructive text-xs">error</span>}
                        </div>
                        {o.url ? (
                          <>
                            <img src={o.url} alt="" className="w-full h-32 object-cover" />
                            <a href={o.url} download className="text-xs underline inline-flex items-center gap-1">
                              <Download className="h-3 w-3" /> Download
                            </a>
                          </>
                        ) : (
                          <div className="h-32 bg-muted animate-pulse" />
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {videoOutputs.length > 0 && (
                <Card className="p-4">
                  <div className="font-medium mb-3 flex items-center gap-2">
                    <Film className="h-4 w-4" /> Ken Burns videos
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {videoOutputs.map((o) => (
                      <div key={o.id} className="border rounded p-2 space-y-2">
                        <div className="text-xs flex items-center justify-between">
                          <Badge variant="outline">{o.ratio} · {o.meta?.duration}s</Badge>
                          <span className="text-muted-foreground">{o.meta?.status ?? o.status}</span>
                        </div>
                        {o.url ? (
                          <>
                            <video src={o.url} controls className="w-full" />
                            <a href={o.url} download className="text-xs underline inline-flex items-center gap-1">
                              <Download className="h-3 w-3" /> Download
                            </a>
                          </>
                        ) : (
                          <div className="h-48 bg-muted flex items-center justify-center text-xs text-muted-foreground gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Rendering on Creatomate…
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {copyOutputs.length > 0 && (
                <Card className="p-4">
                  <div className="font-medium mb-3 flex items-center gap-2">
                    <Type className="h-4 w-4" /> Copy variants
                  </div>
                  <div className="space-y-3">
                    {copyOutputs.map((o) => (
                      <div key={o.id} className="border rounded p-3 space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge>{o.meta?.tone}</Badge>
                        </div>
                        <div className="font-semibold text-base">{o.meta?.headline}</div>
                        <div className="text-muted-foreground">{o.meta?.subhead}</div>
                        <div>
                          <span className="font-medium">CTA:</span> {o.meta?.cta}
                        </div>
                        <div className="text-xs text-muted-foreground">{o.meta?.caption}</div>
                        <div className="text-xs">{(o.meta?.hashtags ?? []).join(" ")}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}