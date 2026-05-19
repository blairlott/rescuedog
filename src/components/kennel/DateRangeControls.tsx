import { useMemo } from "react";
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
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() + 90);
  return d;
}

/** Quick presets — useful shortcuts, not the only way to pick a range. */
const PRESETS: { label: string; start: () => Date; end: () => Date }[] = [
  { label: "Life", start: () => MIN_START, end: () => { const d = todayUTC(); d.setUTCDate(d.getUTCDate() + 90); return d; } },
  { label: "3y · +1y", start: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() - 3); return d; }, end: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() + 1); return d; } },
  { label: "1y · +1y", start: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() - 1); return d; }, end: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() + 1); return d; } },
  { label: "90d · +90d", start: () => { const d = todayUTC(); d.setUTCDate(d.getUTCDate() - 90); return d; }, end: () => { const d = todayUTC(); d.setUTCDate(d.getUTCDate() + 90); return d; } },
  { label: "+3y plan", start: () => todayUTC(), end: () => { const d = todayUTC(); d.setUTCFullYear(d.getUTCFullYear() + 3); return d; } },
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
  const min = MIN_START;
  const max = useMemo(() => maxEnd(), []);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <DatePill label="Start" value={start} onChange={setStart}
        disabled={(d) => d < min || d > end || d > max} />
      <span className="text-[10px] uppercase tracking-brand text-muted-foreground">→</span>
      <DatePill label="End" value={end} onChange={setEnd}
        disabled={(d) => d < start || d > max || d < min} />

      <span className="text-[10px] uppercase tracking-brand text-muted-foreground mx-1">·</span>
      {PRESETS.map((p) => (
        <Button key={p.label} size="sm" variant="outline"
          onClick={() => { setStart(p.start()); setEnd(p.end()); }}
          style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-2"
        >
          {p.label}
        </Button>
      ))}

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

function DatePill({ label, value, onChange, disabled }: {
  label: string; value: Date; onChange: (d: Date) => void;
  disabled?: (d: Date) => boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" style={{ borderRadius: 0 }}
          className="uppercase tracking-brand text-[10px] h-7 px-2 gap-1 font-normal"
        >
          <CalendarIcon className="h-3 w-3" />
          <span className="text-muted-foreground">{label}:</span>
          <span className="font-bold">{format(value, "MMM d, yyyy")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && onChange(d)}
          disabled={disabled}
          defaultMonth={value}
          captionLayout="dropdown-buttons"
          fromYear={2018}
          toYear={new Date().getFullYear() + 3}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
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