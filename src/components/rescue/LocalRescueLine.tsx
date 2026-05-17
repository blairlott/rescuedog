import { useQuery } from "@tanstack/react-query";
import { PawPrint } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useShipState } from "@/components/ShipsToStateCheck";

/**
 * Geo-personalized rescue partner line for product pages.
 * Reads the visitor's chosen ship-to state and surfaces the closest
 * active rescue partner in that state (or any focus partner if none).
 * Renders nothing until a state is selected and a match is found.
 */
export function LocalRescueLine() {
  const { state } = useShipState();

  const { data: partner } = useQuery({
    queryKey: ["local-rescue", state],
    enabled: !!state,
    queryFn: async () => {
      if (!state) return null;
      const { data } = await supabase
        .from("rescue_partners")
        .select("name, city, state, url")
        .eq("state", state)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!partner) return null;

  return (
    <div className="flex items-start gap-2 text-xs leading-snug border-l-2 border-primary pl-3 py-1.5">
      <PawPrint className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
      <p className="text-foreground">
        <span className="font-bold uppercase tracking-brand text-primary">Your local rescue · </span>
        Bottles shipped to {partner.state} help{" "}
        {partner.url ? (
          <a href={partner.url} target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-primary">
            {partner.name}
          </a>
        ) : (
          <span className="font-bold">{partner.name}</span>
        )}
        {partner.city ? <span className="text-muted-foreground"> · {partner.city}</span> : null}.
      </p>
    </div>
  );
}