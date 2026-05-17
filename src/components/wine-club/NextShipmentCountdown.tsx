import { Calendar, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  /** ISO date string */
  nextShipmentDate: string | null;
}

/**
 * Compact countdown to the next club shipment. Members-only — drives
 * anticipation and gives them a clear window to customize before it ships.
 * Renders nothing when no date is set or the date is in the past.
 */
export function NextShipmentCountdown({ nextShipmentDate }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!nextShipmentDate) return null;
  const target = new Date(nextShipmentDate).getTime();
  if (!Number.isFinite(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

  const formatted = new Date(nextShipmentDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="border-2 border-primary bg-primary/5 p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-brand font-bold text-primary">
            Next Release · Members First
          </p>
          <p className="text-sm font-bold text-foreground">
            Ships {formatted}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 self-start sm:self-auto">
        <div className="text-center px-3 py-1.5 border border-border bg-background">
          <p className="text-lg font-bold text-foreground leading-none">{days}</p>
          <p className="text-[9px] uppercase tracking-brand text-muted-foreground">Days</p>
        </div>
        <div className="text-center px-3 py-1.5 border border-border bg-background">
          <p className="text-lg font-bold text-foreground leading-none">{hours}</p>
          <p className="text-[9px] uppercase tracking-brand text-muted-foreground">Hrs</p>
        </div>
        <Calendar className="hidden sm:block h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}