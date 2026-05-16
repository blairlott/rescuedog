import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/visitorId";
import { useCustomerAuth } from "./useCustomerAuth";
import { useVisitorSegment, matchesSegment, VisitorSegment } from "./usePersonalization";
import { usePersonalizationRules } from "./usePersonalizationRules";

export interface ExperimentAssignment<T = Record<string, unknown>> {
  variantId: string | null;
  variantKey: string | null;
  experimentId: string | null;
  config: T;
  source: "experiment" | "personalization" | "default";
  recordConversion: (goalKey?: string, metadata?: Record<string, unknown>) => void;
  recordRevenue: (revenueCents: number, goalKey?: string, metadata?: Record<string, unknown>) => void;
}

const cache = new Map<string, { variantId: string; variantKey: string; experimentId: string; config: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Resolves a slot to a variant. Lookup order:
 * 1. Active personalization rule whose segment matches (deterministic, fastest).
 * 2. Running experiment with matching slot_key (Thompson-sampled, sticky).
 * 3. Default config passed by the caller.
 *
 * Records an exposure event on first resolve so revenue-per-visitor is accurate.
 */
export function useExperiment<T extends Record<string, unknown>>(
  slotKey: string,
  defaultConfig: T,
): ExperimentAssignment<T> {
  const { user } = useCustomerAuth();
  const segment = useVisitorSegment();
  const rules = usePersonalizationRules(slotKey);

  const [state, setState] = useState<{
    variantId: string | null;
    variantKey: string | null;
    experimentId: string | null;
    config: T;
    source: ExperimentAssignment<T>["source"];
  }>({
    variantId: null,
    variantKey: null,
    experimentId: null,
    config: defaultConfig,
    source: "default",
  });
  const exposedRef = useRef(false);

  useEffect(() => {
    let active = true;

    // 1. Personalization rule wins if any match.
    const rule = rules.find((r) => matchesSegment(r.segment as Record<string, unknown>, segment));
    if (rule) {
      if (active) {
        setState({
          variantId: null,
          variantKey: `rule_${rule.id.slice(0, 8)}`,
          experimentId: null,
          config: { ...defaultConfig, ...(rule.variant_config as Record<string, unknown>) } as T,
          source: "personalization",
        });
      }
      return;
    }

    // 2. Experiment assignment via RPC.
    const visitorId = getVisitorId();
    const cacheKey = `${slotKey}::${visitorId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      if (active) {
        setState({
          variantId: cached.variantId,
          variantKey: cached.variantKey,
          experimentId: cached.experimentId,
          config: { ...defaultConfig, ...(cached.config as Record<string, unknown>) } as T,
          source: "experiment",
        });
      }
      return;
    }

    const fetch = async () => {
      // Find a running experiment for this slot.
      const { data: exps } = await supabase
        .from("experiments")
        .select("key")
        .eq("slot_key", slotKey)
        .eq("status", "running")
        .limit(1)
        .maybeSingle();
      if (!exps?.key) return null;

      const { data, error } = await supabase.rpc("experiment_assign", {
        _experiment_key: exps.key,
        _visitor_id: visitorId,
        _user_id: user?.id ?? null,
        _segment: segment as unknown as Record<string, unknown>,
      });
      if (error || !data || !Array.isArray(data) || data.length === 0) return null;
      const row = data[0] as { variant_id: string; variant_key: string; variant_config: unknown; experiment_id: string };
      return row;
    };

    let promise = inflight.get(cacheKey) as Promise<Awaited<ReturnType<typeof fetch>>> | undefined;
    if (!promise) {
      promise = fetch();
      inflight.set(cacheKey, promise);
    }

    promise
      .then((row) => {
        if (!active || !row) return;
        cache.set(cacheKey, {
          variantId: row.variant_id,
          variantKey: row.variant_key,
          experimentId: row.experiment_id,
          config: row.variant_config,
        });
        setState({
          variantId: row.variant_id,
          variantKey: row.variant_key,
          experimentId: row.experiment_id,
          config: { ...defaultConfig, ...(row.variant_config as Record<string, unknown>) } as T,
          source: "experiment",
        });
      })
      .finally(() => {
        inflight.delete(cacheKey);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKey, user?.id, rules, segment.authState, segment.device, segment.referrer, segment.geoIsUS]);

  // Record exposure once per slot per session.
  useEffect(() => {
    if (exposedRef.current) return;
    if (state.source !== "experiment" || !state.experimentId || !state.variantId) return;
    exposedRef.current = true;
    const visitorId = getVisitorId();
    supabase.rpc("experiment_record", {
      _experiment_id: state.experimentId,
      _variant_id: state.variantId,
      _visitor_id: visitorId,
      _user_id: user?.id ?? null,
      _event_type: "exposure",
      _revenue_cents: null,
      _goal_key: null,
      _metadata: {},
    });
  }, [state.source, state.experimentId, state.variantId, user?.id]);

  const recordConversion = useCallback(
    (goalKey?: string, metadata?: Record<string, unknown>) => {
      if (!state.experimentId || !state.variantId) return;
      supabase.rpc("experiment_record", {
        _experiment_id: state.experimentId,
        _variant_id: state.variantId,
        _visitor_id: getVisitorId(),
        _user_id: user?.id ?? null,
        _event_type: "conversion",
        _revenue_cents: null,
        _goal_key: goalKey ?? null,
        _metadata: metadata ?? {},
      });
    },
    [state.experimentId, state.variantId, user?.id],
  );

  const recordRevenue = useCallback(
    (revenueCents: number, goalKey?: string, metadata?: Record<string, unknown>) => {
      if (!state.experimentId || !state.variantId) return;
      supabase.rpc("experiment_record", {
        _experiment_id: state.experimentId,
        _variant_id: state.variantId,
        _visitor_id: getVisitorId(),
        _user_id: user?.id ?? null,
        _event_type: "revenue",
        _revenue_cents: Math.max(0, Math.round(revenueCents)),
        _goal_key: goalKey ?? null,
        _metadata: metadata ?? {},
      });
    },
    [state.experimentId, state.variantId, user?.id],
  );

  return {
    variantId: state.variantId,
    variantKey: state.variantKey,
    experimentId: state.experimentId,
    config: state.config,
    source: state.source,
    recordConversion,
    recordRevenue,
  };
}

export type { VisitorSegment };