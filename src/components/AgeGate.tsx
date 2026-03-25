import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { isRescueDogDomain } from "@/lib/productUtils";
import rdwLogo from "@/assets/rdw-logo.png";

const MERCH_ONLY_ROUTES = ["/merch", "/shop"];

function isMerchOnlyRoute(pathname: string): boolean {
  return MERCH_ONLY_ROUTES.includes(pathname);
}

function needsAgeGate(pathname: string): boolean {
  if (isRescueDogDomain() && isMerchOnlyRoute(pathname)) return false;
  if (pathname === "/merch") return false;
  return true;
}

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [remember, setRemember] = useState(true);
  const location = useLocation();

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

  if (!needsAgeGate(location.pathname)) return <>{children}</>;
  if (verified === null) return null;
  if (verified) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-foreground flex items-center justify-center p-4">
      <div className="bg-background max-w-md w-full p-8 text-center">
        <img src={rdwLogo} alt="Rescue Dog Wines" className="w-48 mx-auto mb-6" />
        {denied ? (
          <>
            <h2 className="text-xl font-bold text-foreground mb-4">
              Sorry, you must be 21 or older to visit this site.
            </h2>
            <p className="text-sm text-muted-foreground">
              Please come back when you're of legal drinking age.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Are you over 21 years of age?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              You must be of legal drinking age to enter this site.
            </p>
            <div className="flex gap-4 justify-center mb-6">
              <Button
                onClick={handleYes}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10"
              >
                Yes
              </Button>
              <Button
                onClick={handleNo}
                variant="outline"
                size="lg"
                className="uppercase tracking-brand text-sm font-bold px-10 border-foreground text-foreground hover:bg-foreground hover:text-background"
              >
                No
              </Button>
            </div>
            <label className="flex items-center justify-center gap-2 cursor-pointer text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-primary"
              />
              Remember me
            </label>
          </>
        )}
      </div>
    </div>
  );
}
