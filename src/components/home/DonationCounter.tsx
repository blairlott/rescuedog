import { Heart, Users } from "lucide-react";
import { useDonationMetric } from "@/hooks/useDonationMetric";
import { T } from "@/components/T";

/** Public-facing donation impact badge — qualitative framing per brand rules.
 *  Renders nothing while loading; falls back to the seeded display value on error. */
export function DonationCounter() {
  const { data, isLoading } = useDonationMetric("lifetime_donations");
  if (isLoading || !data) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border border border-border">
      <div className="bg-background p-8 flex items-center gap-4">
        <Heart className="h-8 w-8 text-primary shrink-0" aria-hidden />
        <div>
          <p className="text-3xl md:text-4xl font-bold tracking-tight">
            {data.value_display}
          </p>
          <p className="text-xs md:text-sm uppercase tracking-brand text-muted-foreground mt-1">
            <T>Donated to rescue partners</T>
          </p>
        </div>
      </div>
      <div className="bg-background p-8 flex items-center gap-4">
        <Users className="h-8 w-8 text-primary shrink-0" aria-hidden />
        <div>
          <p className="text-3xl md:text-4xl font-bold tracking-tight">
            {data.partner_count ?? "—"}
          </p>
          <p className="text-xs md:text-sm uppercase tracking-brand text-muted-foreground mt-1">
            <T>Rescue partners supported</T>
          </p>
        </div>
      </div>
    </div>
  );
}