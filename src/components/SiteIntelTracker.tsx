import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { startSiteIntel, trackPage } from "@/lib/siteIntel";
import { tagDefaultClaritySession, setClarityTag } from "@/lib/clarity";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

/**
 * Mounts once at app root. Boots the heatmap/attention tracker and pings
 * it on every SPA route change so section observers re-scan.
 */
export function SiteIntelTracker() {
  const location = useLocation();
  const { user } = useCustomerAuth();
  useEffect(() => { startSiteIntel(); }, []);
  useEffect(() => { trackPage(location.pathname); }, [location.pathname]);
  // Tag Clarity sessions so we can filter heatmaps/recordings by
  // surface, auth state, and ad source.
  useEffect(() => {
    tagDefaultClaritySession({
      ageGatePassed: true, // mounted inside <AgeGate> children
      loggedIn: !!user,
    });
  }, [user]);
  useEffect(() => {
    setClarityTag("route", location.pathname);
  }, [location.pathname]);
  return null;
}