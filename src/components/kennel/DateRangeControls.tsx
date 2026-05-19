import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Shared start/end date range picker used by all Kennel timelines.
 * - start may go as far back as 2018-01-01 (life-of-brand)
 * - end may go as far forward as today + 3 years (forecast horizon)
 * - "today" is always rendered inside the chart as the boundary between observed and projected
 */
export const MIN_START = new Date("2018-01-01T00:00:00Z");
export function maxEnd(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 3);
  return d;
}

export function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultStart(): Date {
  const d = todayUTC();
  d.setUTCFullYear(d.getUTCFullYear() - 3);
  return d;
}
export function defaultEnd(): Date {
  // Default forward horizon = 3 years out so every timeline shows a full
  // life-of-brand → 3-year predictive window without manual extension.
  const d = todayUTC();
  d.setUTCFullYear(d.getUTCFullYear() + 3);
  return d;
}

/** Quick presets — useful shortcuts, not the only way to pick a range. */
const PRESETS: { label: string; start: () => Date; end: () => Date }[] = [
  { label: "All time → 3y forecast", start: () => MIN_START, end: () => maxEnd() },
  { label: "Last 3y → 3y forecast",  start: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() - 3); return d; }, end: () => maxEnd() },
  { label: "Last 1y → 3y forecast",  start: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() - 1); return d; }, end: () => maxEnd() },
  { label: "Last 90d → 1y forecast", start: () => { const d = todayUTC(); d.setUTCDate(d.getUTCDate() - 90); return d; }, end: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() + 1); return d; } },
  { label: "Plan next 3y",           start: () => todayUTC(), end: () => maxEnd() },
];

export function DateRangeControls({
  start, end, setStart, setEnd,
  growthKey, setGrowthKey,
  extraSlot,
}: {
  start: Date; end: Date;
  setStart: (d: Date) => void; setEnd: (d: Date) => void;
  growthKey?: string; setGrowthKey?: (k: string) => void;
  extraSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <DateRangePopover start={start} end={end} setStart={setStart} setEnd={setEnd} />

      {setGrowthKey && (
        <>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground mx-1">·</span>
          <span className="text-[10px] uppercase tracking-brand text-muted-foreground mr-1">growth</span>
          {[
            { key: "flat", label: "Flat" },
            { key: "g10", label: "+10%/yr" },
            { key: "g25", label: "+25%/yr" },
          ].map((g) => (
            <Button key={g.key} size="sm" variant={growthKey === g.key ? "default" : "outline"}
              onClick={() => setGrowthKey(g.key)} style={{ borderRadius: 0 }}
              className="uppercase tracking-brand text-[10px] h-7 px-2"
            >
              {g.label}
            </Button>
          ))}
        </>
      )}

      {extraSlot}
    </div>
  );
}

function DateRangePopover({
  start, end, setStart, setEnd,
}: {
  start: Date; end: Date;
  setStart: (d: Date) => void; setEnd: (d: Date) => void;
}) {
  const min = MIN_START;
  const max = useMemo(() => maxEnd(), []);
  const today = useMemo(() => todayUTC(), []);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"start" | "end">("start");
  const toYear = new Date().getFullYear() + 3;

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setStart(p.start());
    setEnd(p.end());
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-3 gap-2 font-normal"
        >
          <CalendarIcon className="h-3 w-3" />
          <span className="font-bold">{format(start, "MMM d, yyyy")}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-bold">{format(end, "MMM d, yyyy")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-auto border-2 border-foreground"
        style={{ borderRadius: 0 }}
      >
        <div className="flex">
          {/* Preset rail */}
          <div className="flex flex-col border-r border-border bg-muted/30 p-2 gap-1 min-w-[140px]">
            <div className="text-[10px] uppercase tracking-brand text-muted-foreground px-2 py-1">
              Quick ranges
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="text-left text-xs px-2 py-1.5 hover:bg-foreground hover:text-background uppercase tracking-brand transition-colors"
                style={{ borderRadius: 0 }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar pane */}
          <div className="flex flex-col">
            <div className="flex border-b border-border">
              <button
                onClick={() => setTab("start")}
                className={cn(
                  "flex-1 text-[10px] uppercase tracking-brand py-2 px-3 transition-colors",
                  tab === "start"
                    ? "bg-foreground text-background font-bold"
                    : "hover:bg-muted text-muted-foreground"
                )}
                style={{ borderRadius: 0 }}
              >
                Start · {format(start, "MMM d, yyyy")}
              </button>
              <button
                onClick={() => setTab("end")}
                className={cn(
                  "flex-1 text-[10px] uppercase tracking-brand py-2 px-3 transition-colors border-l border-border",
                  tab === "end"
                    ? "bg-foreground text-background font-bold"
                    : "hover:bg-muted text-muted-foreground"
                )}
                style={{ borderRadius: 0 }}
              >
                End · {format(end, "MMM d, yyyy")}
              </button>
            </div>
            {tab === "start" ? (
              <Calendar
                key="start-cal"
                mode="single"
                selected={start}
                onSelect={(d) => { if (d) { setStart(d); setTab("end"); } }}
                disabled={(d) => d < min || d > end || d > today}
                defaultMonth={start}
                captionLayout="dropdown-buttons"
                fromYear={2018}
                toYear={toYear}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            ) : (
              <Calendar
                key="end-cal"
                mode="single"
                selected={end}
                onSelect={(d) => { if (d) { setEnd(d); setOpen(false); } }}
                disabled={(d) => d < start || d > max || d < min}
                defaultMonth={end}
                captionLayout="dropdown-buttons"
                fromYear={2018}
                toYear={toYear}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            )}
            <div className="flex justify-end border-t border-border px-3 py-2 gap-2">
              <Button size="sm" variant="ghost"
                onClick={() => { setStart(defaultStart()); setEnd(defaultEnd()); }}
                style={{ borderRadius: 0 }} className="uppercase tracking-brand text-[10px] h-7">
                Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}
                style={{ borderRadius: 0 }} className="uppercase tracking-brand text-[10px] h-7">
                Done
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Decide daily vs monthly bucketing from a span in days. */
export function pickBucket(spanDays: number): "day" | "month" {
  return spanDays <= 120 ? "day" : "month";
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}

/** Format an x-axis tick (YYYY-MM-DD or YYYY-MM) as "Mon YYYY". */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function formatAxisDate(v: string): string {
  if (!v || typeof v !== "string") return String(v ?? "");
  const m = v.match(/^(\d{4})-(\d{2})/);
  if (!m) return v;
  const year = m[1];
  const month = MONTHS[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))];
  return `${month} ${year}`;
}