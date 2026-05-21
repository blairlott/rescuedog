import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startSiteIntel, trackPage } from "@/lib/siteIntel";

/**
 * Mounts once at app root. Boots the heatmap/attention tracker and pings
 * it on every SPA route change so section observers re-scan.
 */
export function SiteIntelTracker() {
  const location = useLocation();
  useEffect(() => { startSiteIntel(); }, []);
  useEffect(() => { trackPage(location.pathname); }, [location.pathname]);
  return null;
}