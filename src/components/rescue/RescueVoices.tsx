import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Voice = { name: string; city: string; state: string; mission_blurb: string | null };

/**
 * Rotating voices from our actual rescue partners (real mission blurbs,
 * properly attributed). Editorial alternative to fabricated customer
 * testimonials — these are partners we fund, in their own words.
 */
export function RescueVoices({ intervalMs = 7000 }: { intervalMs?: number }) {
  const { data } = useQuery({
    queryKey: ["rescue-voices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rescue_partners")
        .select("name, city, state, mission_blurb")
        .eq("is_active", true)
        .not("mission_blurb", "is", null);
      return ((data ?? []) as Voice[]).filter((v) => (v.mission_blurb ?? "").trim().length > 0);
    },
    staleTime: 10 * 60 * 1000,
  });

  const voices = data ?? [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (voices.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % voices.length), intervalMs);
    return () => clearInterval(t);
  }, [voices.length, intervalMs]);

  if (voices.length === 0) return null;
  const v = voices[idx % voices.length];

  return (
    <section className="py-16 md:py-20 bg-secondary">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-xs uppercase tracking-brand font-bold text-primary mb-4">From the Rescues We Fund</p>
        <Quote className="h-8 w-8 text-primary mx-auto mb-4 opacity-60" />
        <blockquote
          key={idx}
          className="text-xl md:text-2xl font-display leading-snug text-foreground mb-6 animate-in fade-in duration-700"
        >
          "{v.mission_blurb}"
        </blockquote>
        <p className="text-xs uppercase tracking-brand font-bold text-foreground">
          {v.name}
          <span className="text-muted-foreground"> · {[v.city, v.state].filter(Boolean).join(", ")}</span>
        </p>
        {voices.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-5">
            {voices.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${i === idx % voices.length ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}