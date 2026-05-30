import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "rdw_pullquote_set";
const ROTATION_COUNT = 3;

export interface PullQuoteRow {
  id: string;
  outlet_name: string;
  outlet_slug: string;
  pull_quote: string;
  pull_quote_attribution: string | null;
  display_order: number;
}

interface PullQuoteSetEntry {
  ids: string[];
  assigned_at: number;
}

/**
 * Selects up to ROTATION_COUNT pull quotes from the eligible pool.
 * - Pool: status != 'retired' AND show_on_homepage AND pull_quote_show_on_homepage
 *   AND pull_quote IS NOT NULL.
 * - If pool <= ROTATION_COUNT, all are returned.
 * - Otherwise: random ROTATION_COUNT, sticky per visitor via localStorage.
 * Rendering preserves display_order regardless of the random pick order.
 */
export function usePullQuoteRotation() {
  const [quotes, setQuotes] = useState<PullQuoteRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: pool, error } = await (supabase as any)
        .from("press_mentions")
        .select(
          "id, outlet_name, outlet_slug, pull_quote, pull_quote_attribution, display_order"
        )
        .neq("status", "retired")
        .eq("show_on_homepage", true)
        .eq("pull_quote_show_on_homepage", true)
        .not("pull_quote", "is", null)
        .order("display_order", { ascending: true });

      if (cancelled) return;
      if (error || !pool || pool.length === 0) {
        setQuotes([]);
        setLoading(false);
        return;
      }

      const cleanPool: PullQuoteRow[] = (pool as PullQuoteRow[]).filter(
        (p) => p.pull_quote && p.pull_quote.trim().length > 0
      );

      if (cleanPool.length <= ROTATION_COUNT) {
        setQuotes(cleanPool);
        setLoading(false);
        return;
      }

      // Sticky assignment
      let stickyIds: string[] | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: PullQuoteSetEntry = JSON.parse(stored);
          const poolIds = new Set(cleanPool.map((p) => p.id));
          if (
            Array.isArray(parsed.ids) &&
            parsed.ids.length === ROTATION_COUNT &&
            parsed.ids.every((id) => poolIds.has(id))
          ) {
            stickyIds = parsed.ids;
          }
        }
      } catch {
        // ignore parse errors — fall through to new assignment
      }

      if (stickyIds) {
        const selected = cleanPool.filter((p) => stickyIds!.includes(p.id));
        setQuotes(selected);
        setLoading(false);
        return;
      }

      const shuffled = [...cleanPool].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, ROTATION_COUNT);
      selected.sort((a, b) => a.display_order - b.display_order);

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ids: selected.map((s) => s.id),
            assigned_at: Date.now(),
          } satisfies PullQuoteSetEntry)
        );
      } catch {
        // localStorage may be unavailable in private mode — non-fatal
      }

      setQuotes(selected);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { quotes: quotes ?? [], loading };
}