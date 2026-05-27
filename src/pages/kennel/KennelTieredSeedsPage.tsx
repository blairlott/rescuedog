import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play } from "lucide-react";
import { JobRunHistory } from "@/components/kennel/JobRunHistory";
import { Seo } from "@/components/Seo";

export default function KennelTieredSeedsPage() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("kennel-tiered-seeds-monthly", {
        body: { manual: true },
      });
      if (error) throw error;
      toast({ title: "Tiered seed refresh complete", description: JSON.stringify(data).slice(0, 200) });
    } catch (e: any) {
      toast({ title: "Run failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Seo noindex title="Kennel Tiered Seeds" />
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tiered Seed Audiences</h1>
          <p className="text-sm text-muted-foreground">
            Five-tier Meta / Google LAL seed refresh: top-decile LTV (1%), top-quartile LTV (1%), wine club (seed), recent buyers 90d (2%), all buyers 24mo (5%). Cron runs the 1st of every month at 13:00 UTC.
          </p>
        </div>
        <Button size="sm" onClick={runNow} disabled={running}>
          {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
          Run now
        </Button>
      </div>

      <JobRunHistory jobName="tiered_seeds_monthly" title="Tiered seed run history" />
    </div>
    </>
  );
}