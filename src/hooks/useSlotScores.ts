import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVisitorSegment } from "./usePersonalization";

export interface SlotScore {
  variantKey: string;
  score: number;
  exposures: number;
  revenueCents: number;
}

const cache = new Map<string, { at: number; rows: SlotScore[] }>();
const TTL_MS = 60_000;

/**
 * Reads the smoothed per-variant score table for a bandit slot, scoped to the
 * current visitor segment. Returns a Map<variantKey, score> for cheap lookup
 * during catalog re-sort. Falls back to an empty map while loading, so callers
 * should preserve their default ordering until scores arrive.
 */
export function useSlotScores(slotKey: string | null): {
  scores: Map<string, SlotScore>;
  ready: boolean;
  segmentBucket: string;
} {
  const segment = useVisitorSegment();
  const segmentBucket = `${segment.device ?? "any"}|${segment.authState ?? "any"}|${segment.geoIsUS ? "us" : "intl"}`;
  const [rows, setRows] = useState<SlotScore[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!slotKey) {
      setReady(true);
      return;
    }
    const key = `${slotKey}::${segmentBucket}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < TTL_MS) {
      setRows(cached.rows);
      setReady(true);
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_slot_variant_scores", {
        _slot_key: slotKey,
        _segment_bucket: segmentBucket,
      });
      if (!active) return;
      if (error || !data) {
        setRows([]);
        setReady(true);
        return;
      }
      const mapped: SlotScore[] = (data as Array<{ variant_key: string; score: number; exposures: number; revenue_cents: number }>).map((r) => ({
        variantKey: r.variant_key,
        score: Number(r.score) || 0,
        exposures: Number(r.exposures) || 0,
        revenueCents: Number(r.revenue_cents) || 0,
      }));
      cache.set(key, { at: Date.now(), rows: mapped });
      setRows(mapped);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [slotKey, segmentBucket]);

  const scores = useMemo(() => {
    const m = new Map<string, SlotScore>();
    rows.forEach((r) => m.set(r.variantKey, r));
    return m;
  }, [rows]);

  return { scores, ready, segmentBucket };
}