import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GeoState {
  country: string;
  isUS: boolean;
  loading: boolean;
  /** True when we know the visitor's country and they are US. Defaults to true while loading
   *  to avoid flashing disabled buttons; flips to false once a non-US country is confirmed. */
  purchaseAllowed: boolean;
  /** Lets the visitor self-declare US (e.g. VPN, traveling) and unblock checkout. */
  setOverrideUS: (v: boolean) => void;
  override: boolean;
}

const GeoContext = createContext<GeoState | null>(null);
const STORAGE_KEY = "rdw_geo_override_us";

export function GeoProvider({ children }: { children: ReactNode }) {
  const [country, setCountry] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1",
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("geo-detect", { method: "GET" });
        if (!active) return;
        const c = (data?.country as string) || "";
        setCountry(c);
      } catch {
        // network/edge errors → leave unknown; treat as allowed
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isUS = country === "US" || override;
  // If detection failed (empty country) we fail OPEN to avoid blocking real US users.
  const purchaseAllowed = loading || !country || isUS;

  const setOverrideUS = (v: boolean) => {
    setOverride(v);
    if (typeof window !== "undefined") {
      if (v) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <GeoContext.Provider value={{ country, isUS, loading, purchaseAllowed, setOverrideUS, override }}>
      {children}
    </GeoContext.Provider>
  );
}

export function useGeo(): GeoState {
  const ctx = useContext(GeoContext);
  if (!ctx) {
    // Safe fallback when used outside provider — allow purchases.
    return {
      country: "",
      isUS: true,
      loading: false,
      purchaseAllowed: true,
      override: false,
      setOverrideUS: () => {},
    };
  }
  return ctx;
}