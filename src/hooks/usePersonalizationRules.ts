import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PersonalizationRule {
  id: string;
  slot_key: string;
  name: string;
  priority: number;
  segment: unknown;
  variant_config: unknown;
  enabled: boolean;
}

const cache = new Map<string, PersonalizationRule[]>();
const inflight = new Map<string, Promise<PersonalizationRule[]>>();

export function usePersonalizationRules(slotKey: string): PersonalizationRule[] {
  const [rules, setRules] = useState<PersonalizationRule[]>(() => cache.get(slotKey) ?? []);

  useEffect(() => {
    let active = true;
    if (cache.has(slotKey)) {
      setRules(cache.get(slotKey)!);
      return;
    }
    let promise = inflight.get(slotKey);
    if (!promise) {
      promise = supabase
        .from("personalization_rules")
        .select("id,slot_key,name,priority,segment,variant_config,enabled")
        .eq("slot_key", slotKey)
        .eq("enabled", true)
        .order("priority", { ascending: true })
        .then(({ data }) => (data ?? []) as PersonalizationRule[]);
      inflight.set(slotKey, promise);
    }
    promise.then((r) => {
      cache.set(slotKey, r);
      inflight.delete(slotKey);
      if (active) setRules(r);
    });
    return () => {
      active = false;
    };
  }, [slotKey]);

  return rules;
}