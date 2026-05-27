import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Paths that belong on the WINE domain (rescuedogwines.com).
// If hit on rescuedog.com, redirect to the wine domain.
const WINE_ONLY = [
  "/", // root: rescuedog.com root is handled separately (renders Merch)
  "/wines",
  "/shop-wine",
  "/shop",
  "/club",
  "/pairings",
  "/wine-that-gives-back",
  "/vineyard",
  "/subscribe",
  "/mix-six",
];

// Paths that belong on the MERCH domain (rescuedog.com).
const MERCH_ONLY = ["/merch"];

const WINE_HOST = "rescuedogwines.com";
const MERCH_HOST = "rescuedog.com";

function matches(path: string, list: string[]) {
  return list.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Host-aware route guard. Keeps each domain on the pages that belong
 * to it. Runs client-side after hydration; safe no-op on lovable.app
 * preview / published URLs and on localhost.
 */
export function HostRouter() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname.replace(/^www\./, "");
    // Only enforce on the two real custom domains.
    if (host !== WINE_HOST && host !== MERCH_HOST) return;

    let targetHost: string | null = null;

    if (host === MERCH_HOST && pathname !== "/" && matches(pathname, WINE_ONLY)) {
      targetHost = WINE_HOST;
    } else if (host === WINE_HOST && matches(pathname, MERCH_ONLY)) {
      targetHost = MERCH_HOST;
    }

    if (targetHost) {
      window.location.replace(`https://www.${targetHost}${pathname}${search}${hash}`);
    }
  }, [pathname, search, hash]);

  return null;
}

export default HostRouter;