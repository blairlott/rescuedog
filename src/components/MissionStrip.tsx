import { Heart, PawPrint, Wine } from "lucide-react";
import { T } from "@/components/T";

/**
 * Qualitative mission strip — replaces the quantified ImpactCounter.
 * Core rule: NEVER show counters/totals/quantified impact until verified
 * data exists. Three sentiment statements only — no numbers, no tickers.
 */
export function MissionStrip() {
  return (
    <section className="py-12 md:py-16 bg-secondary/30 border-y border-border">
      <div className="container mx-auto px-4 text-center">
        <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">
          <T>Our Mission</T>
        </p>
        <h2 className="text-2xl md:text-4xl font-bold mb-10">
          <T>Helping Dogs Find Their Forever Home</T>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Pillar
            icon={<Wine className="h-7 w-7" aria-hidden />}
            title="Wine With Purpose"
            body="Every bottle is crafted to support rescue dogs across the country."
          />
          <Pillar
            icon={<PawPrint className="h-7 w-7" aria-hidden />}
            title="Rescue Partners"
            body="We work alongside shelters and rescues doing the hardest, most loving work."
          />
          <Pillar
            icon={<Heart className="h-7 w-7" aria-hidden />}
            title="Forever Homes"
            body="Drink well, give back, and help a good dog find the family they've been waiting for."
          />
        </div>
      </div>
    </section>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="border border-border bg-background p-6 flex flex-col items-center text-center">
      <div className="text-primary mb-3">{icon}</div>
      <div className="text-sm font-bold uppercase tracking-brand text-foreground mb-2">
        <T>{title}</T>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        <T>{body}</T>
      </p>
    </div>
  );
}