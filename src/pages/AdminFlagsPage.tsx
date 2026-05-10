import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Flag = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  audience: string;
};

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("key");
    if (error) toast.error(error.message);
    setFlags((data as Flag[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (flag: Flag, enabled: boolean) => {
    setFlags((prev) => prev.map((f) => (f.id === flag.id ? { ...f, enabled } : f)));
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled })
      .eq("id", flag.id);
    if (error) {
      toast.error("Could not update flag — admin only");
      load();
      return;
    }
    // Audit log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert([
      {
        actor_user_id: user?.id,
        actor_email: user?.email,
        entity_type: "feature_flag",
        entity_id: flag.id,
        action: enabled ? "enable" : "disable",
        before: { enabled: flag.enabled },
        after: { enabled },
        metadata: { key: flag.key },
      },
    ]);
    toast.success(`${flag.key} ${enabled ? "enabled" : "disabled"}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Feature Flags</h1>
        <p className="text-muted-foreground mb-8">
          Admin-only. Toggle features on/off without a deploy.
        </p>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="space-y-3">
            {flags.map((flag) => (
              <div key={flag.id} className="border border-border p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-semibold">{flag.key}</code>
                    <span className="text-[10px] uppercase tracking-brand text-muted-foreground border border-border px-1.5 py-0.5">
                      {flag.audience}
                    </span>
                  </div>
                  {flag.description && (
                    <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                  )}
                </div>
                <Switch checked={flag.enabled} onCheckedChange={(v) => toggle(flag, v)} />
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}