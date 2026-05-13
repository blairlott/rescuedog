import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import rdwLogo from "@/assets/rdw-logo.png";
import { T } from "@/components/T";

// Wine-only entry points. The age gate ONLY pops up when a visitor
// lands on (or navigates to) one of these routes. Everything else —
// merch, CRM, CMS, ambassadors, donation, locator, account, about,
// mission, blog, contact, etc. — is non-alcohol and stays gate-free.
const WINE_ROUTE_PREFIXES = [
  "/wines",
  "/club",
  "/wine-club",
  "/pairings",
  "/vineyard",
  "/subscribe",
  "/sommelier",
];
const WINE_EXACT_ROUTES = new Set<string>(["/", "/index", "/checkout", "/thank-you"]);

function needsAgeGate(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  if (WINE_EXACT_ROUTES.has(lower)) return true;
  return WINE_ROUTE_PREFIXES.some((p) => lower === p || lower.startsWith(p + "/"));
}

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [remember, setRemember] = useState(true);
  const location = useLocation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const yesBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("rdw-age-verified");
    const session = sessionStorage.getItem("rdw-age-verified");
    if (stored === "true" || session === "true") setVerified(true);
    else setVerified(false);
  }, []);

  const handleYes = () => {
    if (remember) {
      localStorage.setItem("rdw-age-verified", "true");
    } else {
      sessionStorage.setItem("rdw-age-verified", "true");
    }
    setVerified(true);
  };

  const handleNo = () => {
    setDenied(true);
  };

  const open = needsAgeGate(location.pathname) && verified === false;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!needsAgeGate(location.pathname)) return <>{children}</>;
  if (verified === null) return null;
  if (verified) return <>{children}</>;

  return (
    <div
      className="fixed inset-0 z-[100] bg-foreground flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      aria-describedby="age-gate-desc"
      ref={dialogRef}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }}
    >
      <div className="bg-background max-w-md w-full p-8 text-center">
        <img src={rdwLogo} alt="Rescue Dog Wines" className="w-48 mx-auto mb-6" />
        {denied ? (
          <>
            <h2 id="age-gate-title" className="text-xl font-bold text-foreground mb-4">
              <T>Sorry, you must be 21 or older to visit this site.</T>
            </h2>
            <p id="age-gate-desc" className="text-sm text-muted-foreground">
              <T>Please come back when you're of legal drinking age.</T>
            </p>
          </>
        ) : (
          <>
            <h2 id="age-gate-title" className="text-xl font-bold text-foreground mb-2">
              <T>Are you over 21 years of age?</T>
            </h2>
            <p id="age-gate-desc" className="text-sm text-muted-foreground mb-6">
              <T>You must be of legal drinking age to enter this site.</T>
            </p>
            <div className="flex gap-4 justify-center mb-6">
              <Button
                ref={yesBtnRef}
                autoFocus
                onClick={handleYes}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10"
                aria-label="Yes, I am over 21"
              >
                <T>Yes</T>
              </Button>
              <Button
                onClick={handleNo}
                variant="outline"
                size="lg"
                className="uppercase tracking-brand text-sm font-bold px-10 border-foreground text-foreground hover:bg-foreground hover:text-background"
                aria-label="No, I am under 21"
              >
                <T>No</T>
              </Button>
            </div>
            <label className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-primary"
              />
              <T>Remember me</T>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
