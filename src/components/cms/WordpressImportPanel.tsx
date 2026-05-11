import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, FileText, CalendarDays, FileBox, ArrowRightLeft } from "lucide-react";

type Run = {
  id: string; source_url: string; post_type: string; status: string;
  imported_count: number; failed_count: number; error_log: string | null;
  started_at: string; completed_at: string | null;
};

const PRESETS = [
  { key: "posts", label: "Blog posts", icon: FileText, target_type: "post", target_prefix: "/blog" },
  { key: "pages", label: "Pages", icon: FileBox, target_type: "page", target_prefix: "" },
  { key: "tribe_events", label: "Events (The Events Calendar plugin)", icon: CalendarDays, target_type: "event", target_prefix: "/events" },
  { key: "events", label: "Events (custom post type)", icon: CalendarDays, target_type: "event", target_prefix: "/events" },
];

export function WordpressImportPanel() {
  const { toast } = useToast();
  const [siteUrl, setSiteUrl] = useState(() => localStorage.getItem("wp_import_site") ?? "https://rescuedogwines.com");
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const loadRuns = async () => {
    const { data } = await supabase.from("wp_import_runs").select("*").order("started_at", { ascending: false }).limit(15);
    setRuns((data as any) ?? []);
  };
  useEffect(() => { loadRuns(); }, []);

  const runImport = async (preset: typeof PRESETS[number]) => {
    if (!siteUrl) return toast({ title: "Enter your WordPress site URL first", variant: "destructive" });
    localStorage.setItem("wp_import_site", siteUrl);
    setLoading(preset.key);
    const { data, error } = await supabase.functions.invoke("wp-import", {
      body: { site_url: siteUrl, post_type: preset.key, target_type: preset.target_type, target_prefix: preset.target_prefix },
    });
    setLoading(null);
    if (error) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } else if (data?.error) {
      toast({ title: "Import failed", description: data.error, variant: "destructive" });
    } else {
      toast({ title: `Imported ${data?.imported ?? 0} ${preset.label.toLowerCase()}`, description: data?.failed ? `${data.failed} failed` : "All items imported." });
    }
    loadRuns();
  };

  return (
    <div className="bg-background border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-bold text-foreground">WordPress Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pull posts, pages, and events from your existing WordPress / Cloudways site into Lovable. Featured images are re-hosted automatically and 301 redirects are written for SEO.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-1.5 max-w-xl">
          <Label htmlFor="wp-site">WordPress site URL</Label>
          <Input id="wp-site" type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://yourdomain.com" />
          <p className="text-xs text-muted-foreground">Public WP REST API at <code>{siteUrl}/wp-json/wp/v2/</code> must be reachable. No password needed for published content.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <button key={p.key} disabled={!!loading} onClick={() => runImport(p)}
                className="text-left border border-border p-4 hover:border-primary disabled:opacity-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm">{p.label}</span>
                  </div>
                  {loading === p.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Lands at <code>{p.target_prefix || "/"}{p.target_prefix.endsWith("/") ? "" : "/"}<em>slug</em></code>
                </p>
              </button>
            );
          })}
        </div>

        <div>
          <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Recent imports</h3>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-semibold">When</th>
                    <th className="py-2 px-3 font-semibold">Source</th>
                    <th className="py-2 px-3 font-semibold">Type</th>
                    <th className="py-2 px-3 font-semibold">Imported</th>
                    <th className="py-2 px-3 font-semibold">Failed</th>
                    <th className="py-2 px-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-secondary/40"}>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="py-2 px-3 truncate max-w-[200px]">{r.source_url}</td>
                      <td className="py-2 px-3">{r.post_type}</td>
                      <td className="py-2 px-3">{r.imported_count}</td>
                      <td className="py-2 px-3">{r.failed_count}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${r.status === "complete" ? "bg-primary/10 text-primary" : r.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}