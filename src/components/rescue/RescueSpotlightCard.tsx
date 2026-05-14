import { Heart, ExternalLink, PawPrint } from "lucide-react";
import { useRescueSpotlight } from "@/hooks/useRescueSpotlight";
import { useMemo } from "react";

type Variant = "inline" | "compact";

interface Props {
  variant?: Variant;
  /** Optional seed string so siblings (shop + cart) re-roll independently. */
  seed?: string;
  className?: string;
}

/**
 * Rotating spotlight for a curated focus-region rescue partner.
 * Inline: full-width editorial card sized to drop into a product grid row.
 * Compact: slim banner above checkout / cart actions.
 */
export function RescueSpotlightCard({ variant = "inline", seed, className = "" }: Props) {
  // Stable seed per mount when not provided so the same pick persists
  // for the duration of the page view but rotates on the next visit.
  const stableSeed = useMemo(() => seed ?? `${Date.now()}-${Math.random()}`, [seed]);
  const { spotlight, isLoading } = useRescueSpotlight(stableSeed);

  if (isLoading || !spotlight) return null;

  const stateLabel = spotlight.state === "CA" ? "California" : spotlight.state === "GA" ? "Georgia" : spotlight.state;
  const location = [spotlight.city, stateLabel].filter(Boolean).join(", ");

  if (variant === "compact") {
    return (
      <div className={`border border-primary/30 bg-primary/5 p-3 flex items-start gap-3 ${className}`}>
        <div className="flex-shrink-0 w-10 h-10 bg-primary/10 flex items-center justify-center">
          <PawPrint className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-brand font-bold text-primary mb-0.5">
            Rescue Spotlight · {stateLabel}
          </div>
          <div className="text-sm font-bold text-foreground leading-tight">{spotlight.name}</div>
          {spotlight.mission_blurb ? (
            <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{spotlight.mission_blurb}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{location}</p>
          )}
          {spotlight.url ? (
            <a
              href={spotlight.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-brand font-bold text-primary mt-1.5 hover:underline"
            >
              Visit rescue <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  // Inline (shop grid)
  return (
    <div
      className={`group relative overflow-hidden bg-foreground text-background border border-foreground ${className}`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-5 min-h-[220px]">
        <div className="relative sm:col-span-2 bg-primary/20 min-h-[180px]">
          {spotlight.photo_url ? (
            <img
              src={spotlight.photo_url}
              alt={spotlight.name}
              className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <PawPrint className="h-16 w-16 text-primary/60" />
            </div>
          )}
          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-2 py-1 text-[10px] uppercase tracking-brand font-bold">
            <Heart className="h-3 w-3 fill-current" /> Rescue Spotlight
          </div>
        </div>

        <div className="sm:col-span-3 p-6 sm:p-8 flex flex-col justify-center">
          <div className="text-[10px] uppercase tracking-brand font-bold text-primary mb-2">
            {stateLabel}{spotlight.city ? ` · ${spotlight.city}` : ""}
          </div>
          <h3 className="font-display text-2xl sm:text-3xl font-bold leading-tight mb-3">
            {spotlight.name}
          </h3>
          {spotlight.mission_blurb ? (
            <p className="text-sm sm:text-base text-background/80 leading-relaxed mb-4">
              {spotlight.mission_blurb}
            </p>
          ) : (
            <p className="text-sm sm:text-base text-background/80 leading-relaxed mb-4">
              A focus partner helping dogs find their forever home.
            </p>
          )}
          {spotlight.url ? (
            <a
              href={spotlight.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 self-start text-xs uppercase tracking-brand font-bold border border-background/40 px-4 py-2 hover:bg-background hover:text-foreground transition-colors"
            >
              Meet the rescue <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}