import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Wine, Activity, Radar } from "lucide-react";
import { SOURCE_LABEL, TILE_BY_KEY, type FinanceTileSource } from "@/lib/financeTiles";
import { renderTile } from "@/components/finance/FinanceTiles";
import { SortableTileGrid, type SortableTile } from "@/components/finance/SortableTileGrid";

const SOURCE_META: Record<FinanceTileSource, { icon: typeof BookOpen; chip: string }> = {
  quickbooks:     { icon: BookOpen, chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  vinoshipper:    { icon: Wine,     chip: "bg-primary/10 text-primary" },
  command_center: { icon: Activity, chip: "bg-foreground/10 text-foreground" },
  kennel_mirror:  { icon: Radar,    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

export default function SharedBoardPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [marked, setMarked] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["cfo_shared_board", shareId],
    enabled: !!shareId,
    queryFn: async () => {
      const { data: share, error: e1 } = await supabase
        .from("cfo_board_shares" as any)
        .select("*, cfo_boards(*)")
        .eq("id", shareId!)
        .maybeSingle();
      if (e1) throw e1;
      if (!share) throw new Error("Share not found or no access");
      return share as any;
    },
  });

  // Mark viewed once
  useEffect(() => {
    if (!data || marked || data.viewed_at) return;
    supabase.from("cfo_board_shares" as any).update({ viewed_at: new Date().toISOString() } as any).eq("id", data.id).then(() => setMarked(true));
  }, [data, marked]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading shared board…</div>;
  if (error || !data) return (
    <div className="p-8 max-w-xl mx-auto">
      <p className="font-semibold mb-2">Can't open this shared board.</p>
      <p className="text-sm text-muted-foreground mb-4">It may have been revoked, or your account doesn't match the recipient on this share.</p>
      <Link to="/finance" className="text-primary underline text-sm">Back to Finance</Link>
    </div>
  );

  const isSnapshot = data.share_type === "snapshot" && data.snapshot;
  const tileKeys: string[] = isSnapshot ? (data.snapshot.tiles ?? []) : (data.cfo_boards?.tiles ?? []);
  const days: number = isSnapshot ? (data.snapshot.date_range_days ?? 90) : (data.cfo_boards?.date_range_days ?? 90);
  const startDate: string | null = isSnapshot ? (data.snapshot.start_date ?? null) : (data.cfo_boards?.start_date ?? null);
  const endDate: string | null = isSnapshot ? (data.snapshot.end_date ?? null) : (data.cfo_boards?.end_date ?? null);
  const customRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
  const boardName = isSnapshot ? (data.snapshot.name ?? "Snapshot") : (data.cfo_boards?.name ?? "Shared board");

  const sortableTiles: SortableTile[] = tileKeys
    .map((key) => {
      const def = TILE_BY_KEY[key];
      if (!def) return null;
      const meta = SOURCE_META[def.source];
      return {
        id: key, span: def.defaultSpan, badge: SOURCE_LABEL[def.source],
        title: def.title, badgeClass: meta.chip,
        body: <div className="flex-1">{renderTile(key, days, customRange)}</div>,
      } as SortableTile;
    }).filter(Boolean) as SortableTile[];

  return (
    <div className="finance-workspace px-6 py-5 space-y-5 max-w-[1700px] mx-auto">
      <div className="sticky top-14 z-20 -mx-6 px-6 py-3 bg-card border-b border-border flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" asChild className="h-8"><Link to="/finance"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back</Link></Button>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground">
            Shared with you · {isSnapshot ? `Snapshot · frozen ${new Date(data.snapshot.frozen_at).toLocaleString()}` : "Live view"}
          </span>
          <h1 className="text-base font-bold">{boardName}</h1>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">Read-only · last {days} days</div>
      </div>

      {data.message && (
        <div className="border border-border bg-card p-3 text-sm">
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-2">Note from sender</span>
          {data.message}
        </div>
      )}

      {sortableTiles.length === 0 && (
        <div className="border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">This board has no tiles.</div>
      )}

      <SortableTileGrid tiles={sortableTiles} onReorder={() => {}} readOnly />
    </div>
  );
}
