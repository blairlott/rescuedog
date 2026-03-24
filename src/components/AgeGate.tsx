import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import rdwLogo from "@/assets/rdw-logo.png";

export function AgeGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("rdw-age-verified");
    if (stored === "true") setVerified(true);
    else setVerified(false);
  }, []);

  const handleYes = () => {
    localStorage.setItem("rdw-age-verified", "true");
    setVerified(true);
  };

  const handleNo = () => {
    setDenied(true);
  };

  if (verified === null) return null; // loading

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
              Are you 21 or older?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              You must be of legal drinking age to enter this site.
            </p>
            <div className="flex gap-4 justify-center">
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
          </>
        )}
      </div>
    </div>
  );
}
