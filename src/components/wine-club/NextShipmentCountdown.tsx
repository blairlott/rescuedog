import { Sparkles } from "lucide-react";
import { describeNextShipmentWindow } from "@/lib/wineClubSchedule";

interface Props {
  /** ISO date string */
  nextShipmentDate: string | null;
  /** Tier frequency (monthly/quarterly/bi-annual/yearly) — drives the
   *  human-readable window we show (no specific date, since timing flexes
   *  with weather). */
  tierFrequency?: string | null;
}

/**
 * Compact countdown to the next club shipment. Members-only — drives
 * anticipation and gives them a clear window to customize before it ships.
 * Renders nothing when no date is set or the date is in the past.
 */
export function NextShipmentCountdown({ nextShipmentDate: _ignored, tierFrequency }: Props) {
  // We intentionally do NOT show a specific date — shipment timing flexes
  // with weather, so we show only the holiday/seasonal window.
  if (!tierFrequency) return null;
  const window = describeNextShipmentWindow(tierFrequency);

  return (
    <div className="border-2 border-primary bg-primary/5 p-4 mb-6 flex items-center gap-3">
      <div className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-brand font-bold text-primary">
          Next Release · Members First
        </p>
        <p className="text-sm font-bold text-foreground">
          Arrives {window}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          We'll email you about a week before it ships so you can customize.
        </p>
      </div>
    </div>
  );
}