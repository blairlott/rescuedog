import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Calendar, BookOpen, Wine, Activity, Sparkles, RefreshCcw, Share2, Inbox, Trash2, LayoutDashboard, Radar } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { FINANCE_TILES, SOURCE_LABEL, TILE_BY_KEY, type FinanceTileSource } from "@/lib/financeTiles";
import { renderTile } from "@/components/finance/FinanceTiles";
import { FeatureRequestBox } from "@/components/admin/FeatureRequestBox";
import { QuickBooksPanel } from "@/components/finance/QuickBooksPanel";
import { TileInsightStrip } from "@/components/finance/InsightStrip";
import { InsightsDrawer } from "@/components/finance/InsightsDrawer";
import { useCfoInsights } from "@/hooks/finance/useCfoInsights";
import { useCfoBoards, useCreateBoard, useUpdateBoard, useDeleteBoard, useIncomingShares, type CfoBoard } from "@/hooks/finance/useCfoBoards";
import { SortableTileGrid, type SortableTile } from "@/components/finance/SortableTileGrid";
import { ShareBoardDialog } from "@/components/finance/ShareBoardDialog";
import { GrazChat } from "@/components/finance/GrazChat";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 12 months", days: 365 },
];

const SOURCE_META: Record<FinanceTileSource, { icon: typeof BookOpen; chip: string }> = {
  quickbooks:     { icon: BookOpen, chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  vinoshipper:    { icon: Wine,     chip: "bg-primary/10 text-primary" },
  command_center: { icon: Activity, chip: "bg-foreground/10 text-foreground" },
  kennel_mirror:  { icon: Radar,    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

export default function FinanceDashboard() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const { data: openInsights = [] } = useCfoInsights("open");
  const { data: boards = [] } = useCfoBoards(userId);
  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();
  const deleteBoard = useDeleteBoard();
  const { data: incoming = [] } = useIncomingShares(userId, userEmail);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      setUserId(u?.id ?? null);
      setUserEmail(u?.email ?? null);
      if (u?.id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle();
        setUserName((p as any)?.full_name ?? null);
      }
    });
  }, []);

  // Default to first board
  useEffect(() => {
    if (!activeBoardId && boards.length) setActiveBoardId(boards[0].id);
  }, [boards, activeBoardId]);

  const board: CfoBoard | undefined = boards.find(b => b.id === activeBoardId);
  const tiles = board?.tiles ?? [];
  const days = board?.date_range_days ?? 90;

  const persistBoard = (patch: Partial<CfoBoard>) => {
    if (!board) return;
    updateBoard.mutate({ id: board.id, ...patch });
  };

  const addTile = (key: string) => {
    if (!board) return;
    if (tiles.includes(key)) { toast.info("Already on this board"); return; }
    persistBoard({ tiles: [...tiles, key] });
  };
  const removeTile = (key: string) => persistBoard({ tiles: tiles.filter(k => k !== key) });
  const reorderTiles = (next: string[]) => persistBoard({ tiles: next });
  const onDaysChange = (v: string) => persistBoard({ date_range_days: Number(v) });

  const grouped = useMemo(() => {
    const g: Record<FinanceTileSource, typeof FINANCE_TILES> = { quickbooks: [], vinoshipper: [], command_center: [], kennel_mirror: [] };
    for (const t of FINANCE_TILES) g[t.source].push(t);
    return g;
  }, []);

  const sortableTiles: SortableTile[] = tiles
    .map(key => {
      const def = TILE_BY_KEY[key];
      if (!def) return null;
      const meta = SOURCE_META[def.source];
      const tile: SortableTile = {
        id: key,
        span: def.defaultSpan,
        badge: SOURCE_LABEL[def.source],
        title: def.title,
        badgeClass: meta.chip,
        body: (
          <div className="flex flex-col h-full">
            <div className="flex-1">{renderTile(key, days)}</div>
            <TileInsightStrip tileKey={key} onOpen={() => setInsightsOpen(true)} />
          </div>
        ),
      };
      return tile;
    })
    .filter(Boolean) as SortableTile[];

  const newBoard = async () => {
    if (!userId) return;
    const name = window.prompt("Board name", `Board ${boards.length + 1}`);
    if (!name?.trim()) return;
    const b = await createBoard.mutateAsync({ ownerId: userId, name: name.trim(), position: boards.length });
    setActiveBoardId(b.id);
  };

  const deleteCurrent = async () => {
    if (!board) return;
    if (boards.length <= 1) { toast.error("Can't delete your last board"); return; }
    if (!confirm(`Delete board "${board.name}"?`)) return;
    await deleteBoard.mutateAsync(board.id);
    setActiveBoardId(null);
  };

  const renameCurrent = async () => {
    if (!board) return;
    const name = window.prompt("Rename board", board.name);
    if (!name?.trim()) return;
    persistBoard({ name: name.trim() });
  };

  return (
    <div className="finance-workspace px-6 py-5 space-y-5 max-w-[1700px] mx-auto">
      {/* Sticky toolbar */}
      <div className="sticky top-14 z-20 -mx-6 px-6 py-3 bg-card border-b border-border flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={activeBoardId ?? ""} onValueChange={setActiveBoardId}>
            <SelectTrigger className="h-8 w-48 text-sm font-bold border-border">
              <SelectValue placeholder="Select board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={newBoard} title="New board"><Plus className="h-4 w-4" /></Button>
          {board && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={renameCurrent}>Rename</Button>}
          {board && boards.length > 1 && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={deleteCurrent} title="Delete board"><Trash2 className="h-4 w-4" /></Button>}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 relative" onClick={() => setShowInbox(!showInbox)}>
            <Inbox className="h-3.5 w-3.5" /> Shared with me
            {incoming.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 px-1 items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground">{incoming.length}</span>
            )}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!board} onClick={() => setShareOpen(true)}>
            <Share2 className="h-3.5 w-3.5" /> Push view
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => qc.invalidateQueries()} title="Refresh all tiles">
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant={openInsights.length ? "default" : "outline"} className="h-8 gap-1.5 relative" onClick={() => setInsightsOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Insights
            {openInsights.length > 0 && (
              <span className="ml-1 inline-flex h-4 min-w-4 px-1 items-center justify-center text-[10px] font-bold bg-background text-foreground">{openInsights.length}</span>
            )}
          </Button>
          <div className="flex items-center gap-2 h-8 px-2 border border-border bg-card">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={String(days)} onValueChange={onDaysChange}>
              <SelectTrigger className="w-36 h-6 border-0 px-0 focus:ring-0 shadow-none text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map(r => <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8"><Plus className="h-3.5 w-3.5 mr-1" /> Add tile</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
              {(Object.keys(grouped) as FinanceTileSource[]).map(src => (
                <div key={src}>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-brand">{SOURCE_LABEL[src]}</DropdownMenuLabel>
                  {grouped[src].map(t => (
                    <DropdownMenuItem
                      key={t.key}
                      disabled={tiles.includes(t.key)}
                      onSelect={() => addTile(t.key)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Incoming shares inbox */}
      {showInbox && (
        <div className="border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-brand font-semibold mb-2 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5" /> Boards pushed to you
          </div>
          {!incoming.length && <div className="text-sm text-muted-foreground">Nothing in your inbox yet.</div>}
          <div className="space-y-1">
            {incoming.map((s: any) => (
              <Link
                key={s.id}
                to={`/finance/shared/${s.id}`}
                className="flex items-center gap-2 border border-border p-2 hover:border-foreground/40 transition-colors text-sm"
              >
                <span className={`text-[9px] px-1.5 py-0.5 uppercase tracking-brand ${s.share_type === "live" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-foreground/10"}`}>{s.share_type}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.cfo_boards?.name ?? "Untitled board"}</div>
                  {s.message && <div className="text-xs text-muted-foreground truncate">“{s.message}”</div>}
                </div>
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!tiles.length && (
        <div className="border border-dashed border-border bg-card p-12 text-center">
          <div className="text-sm font-semibold">{board?.name ?? "Your dashboard"} is empty</div>
          <p className="text-sm text-muted-foreground mt-1">Click "Add tile" to pull in KPIs from QuickBooks, Vinoshipper, Command Center, or read-only Kennel mirrors.</p>
        </div>
      )}

      {tiles.length > 0 && (
        <SortableTileGrid tiles={sortableTiles} onReorder={reorderTiles} onRemove={removeTile} />
      )}

      <GrazChat days={days} userId={userId} />

      {userId && (
        <FeatureRequestBox
          userId={userId}
          userEmail={userEmail}
          userName={userName}
          priority="high"
          defaultArea="Finance"
          title="Send a request to the owner"
          description="Submit a feature request, fix, or data ask. CFO requests are flagged HIGH PRIORITY in the owner's inbox."
        />
      )}

      <QuickBooksPanel days={days} />
      <InsightsDrawer open={insightsOpen} onOpenChange={setInsightsOpen} days={days} />
      {userId && (
        <ShareBoardDialog open={shareOpen} onOpenChange={setShareOpen} board={board ?? null} userId={userId} />
      )}
    </div>
  );
}
