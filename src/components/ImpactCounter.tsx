import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Totals = {
  total_bottles: number;
  total_donation_cents: number;
  total_customers: number;
  total_rescues: number;
};

export function ImpactCounter() {
  const [totals, setTotals] = useState<Totals | null>(null);

  useEffect(() => {
    supabase.rpc("get_public_impact_totals").then(({ data }) => {
      if (data && data.length > 0) setTotals(data[0] as Totals);
    });
  }, []);

  // Show even if zero so the section structure is consistent
  const bottles = Number(totals?.total_bottles ?? 0);
  const dollars = Math.round(Number(totals?.total_donation_cents ?? 0) / 100);
  const rescues = Number(totals?.total_rescues ?? 0);

  return (
    <section className="py-12 md:py-16 bg-secondary/30 border-y border-border">
      <div className="container mx-auto px-4 text-center">
        <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">
          Our Impact
        </p>
        <h2 className="text-2xl md:text-4xl font-bold mb-8">
          Every Bottle Helps a Rescue Dog
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <Stat value={bottles.toLocaleString()} label="Bottles sold" />
          <Stat value={`$${dollars.toLocaleString()}`} label="Donated to rescues" />
          <Stat value={rescues.toLocaleString()} label="Rescue partners" />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-background p-6">
      <div className="text-3xl md:text-4xl font-bold text-primary">{value}</div>
      <div className="text-xs uppercase tracking-brand text-muted-foreground mt-2">{label}</div>
    </div>
  );
}