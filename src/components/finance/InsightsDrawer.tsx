import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCfoInsights, useGenerateInsights } from "@/hooks/finance/useCfoInsights";
import { InsightCard } from "./InsightStrip";
import { Loader2, Sparkles } from "lucide-react";

export function InsightsDrawer({
  open,
  onOpenChange,
  days,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  days: number;
}) {
  const { data: openIns = [] } = useCfoInsights("open");
  const { data: doneIns = [] } = useCfoInsights("done");
  const { data: dismissedIns = [] } = useCfoInsights("dismissed");
  const gen = useGenerateInsights();

  const groups = {
    critical: openIns.filter((i) => i.severity === "critical"),
    watch: openIns.filter((i) => i.severity === "watch"),
    fyi: openIns.filter((i) => i.severity === "fyi"),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:max-w-[420px] flex flex-col">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Insights
          </SheetTitle>
          <SheetDescription className="text-xs">
            Auto-detected material moves vs prior {days}d, with recommended actions.
          </SheetDescription>
        </SheetHeader>
        <div className="pt-2 pb-3 border-b border-border">
          <Button
            size="sm"
            onClick={() => gen.mutate(days)}
            disabled={gen.isPending}
            className="w-full gap-2 h-8"
          >
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Refresh insights
          </Button>
        </div>
        <Tabs defaultValue="open" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-3 h-8">
            <TabsTrigger value="open" className="text-[11px]">Open ({openIns.length})</TabsTrigger>
            <TabsTrigger value="done" className="text-[11px]">Done ({doneIns.length})</TabsTrigger>
            <TabsTrigger value="dismissed" className="text-[11px]">Dismissed ({dismissedIns.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="flex-1 overflow-y-auto space-y-3 mt-2 pr-1">
            {openIns.length === 0 && (
              <div className="text-xs text-muted-foreground py-8 text-center">
                No open insights. Click "Refresh insights" to scan the last {days}d.
              </div>
            )}
            {(["critical", "watch", "fyi"] as const).map((sev) =>
              groups[sev].length === 0 ? null : (
                <div key={sev} className="space-y-2">
                  <div className="text-[9px] uppercase tracking-brand font-bold text-muted-foreground sticky top-0 bg-background py-1">
                    {sev} ({groups[sev].length})
                  </div>
                  {groups[sev].map((i) => <InsightCard key={i.id} insight={i} />)}
                </div>
              ),
            )}
          </TabsContent>
          <TabsContent value="done" className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1">
            {doneIns.length === 0 ? (
              <div className="text-xs text-muted-foreground py-8 text-center">Nothing marked done yet.</div>
            ) : (
              doneIns.map((i) => <InsightCard key={i.id} insight={i} />)
            )}
          </TabsContent>
          <TabsContent value="dismissed" className="flex-1 overflow-y-auto space-y-2 mt-2 pr-1">
            {dismissedIns.length === 0 ? (
              <div className="text-xs text-muted-foreground py-8 text-center">Nothing dismissed.</div>
            ) : (
              dismissedIns.map((i) => <InsightCard key={i.id} insight={i} />)
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}