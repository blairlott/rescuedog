import { useEffect, useMemo, useState } from "react";
import { useGeo } from "./useGeo";
import { useCustomerAuth } from "./useCustomerAuth";
import { useIsMember } from "./useIsMember";

/**
 * Builds a normalized segment object that experiments + personalization
 * rules can target. Cheap, derived from existing context — no extra fetches.
 */
export interface VisitorSegment {
  geoCountry: string;
  geoIsUS: boolean;
  authState: "guest" | "customer" | "member";
  device: "mobile" | "tablet" | "desktop";
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer: "ambassador" | "search" | "social" | "direct" | "other";
  hasAmbassadorRef: boolean;
}

function readUtm(): Pick<VisitorSegment, "utmSource" | "utmMedium" | "utmCampaign"> {
  if (typeof window === "undefined") return {};
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utmSource: p.get("utm_source") || sessionStorage.getItem("utm_source"),
      utmMedium: p.get("utm_medium") || sessionStorage.getItem("utm_medium"),
      utmCampaign: p.get("utm_campaign") || sessionStorage.getItem("utm_campaign"),
    };
  } catch {
    return {};
  }
}

function classifyReferrer(): VisitorSegment["referrer"] {
  if (typeof document === "undefined") return "direct";
  const ref = document.referrer || "";
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/a/") || path.startsWith("/e/")) return "ambassador";
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname;
    if (/google|bing|duckduckgo|yahoo/i.test(host)) return "search";
    if (/facebook|instagram|twitter|t\.co|tiktok|pinterest|linkedin/i.test(host)) return "social";
    return "other";
  } catch {
    return "other";
  }
}

function getDevice(): VisitorSegment["device"] {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

export function useVisitorSegment(): VisitorSegment {
  const { country, isUS } = useGeo();
  const { user } = useCustomerAuth();
  const isMember = useIsMember();
  const [device, setDevice] = useState<VisitorSegment["device"]>(() => getDevice());
  const [utm] = useState(() => readUtm());
  const [referrer] = useState(() => classifyReferrer());
  const [hasAmbassadorRef] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const p = new URLSearchParams(window.location.search);
      return !!(p.get("ref") || localStorage.getItem("rdw_ambassador_ref"));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onResize = () => setDevice(getDevice());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return useMemo<VisitorSegment>(() => {
    const authState: VisitorSegment["authState"] = !user ? "guest" : isMember ? "member" : "customer";
    return {
      geoCountry: country || "",
      geoIsUS: isUS,
      authState,
      device,
      utmSource: utm.utmSource ?? null,
      utmMedium: utm.utmMedium ?? null,
      utmCampaign: utm.utmCampaign ?? null,
      referrer,
      hasAmbassadorRef,
    };
  }, [country, isUS, user, isMember, device, utm, referrer, hasAmbassadorRef]);
}

/**
 * Evaluates whether a segment rule (jsonb) matches the current visitor.
 * Rule shape examples:
 *   { authState: ["member"] }
 *   { device: ["mobile"], referrer: ["ambassador"] }
 *   { geoCountry: ["US"], utmSource: ["google"] }
 * Empty rule = matches everyone.
 */
export function matchesSegment(rule: Record<string, unknown> | null | undefined, seg: VisitorSegment): boolean {
  if (!rule || Object.keys(rule).length === 0) return true;
  for (const [k, v] of Object.entries(rule)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const segVal = (seg as unknown as Record<string, unknown>)[k];
    if (!v.includes(segVal as never)) return false;
  }
  return true;
}