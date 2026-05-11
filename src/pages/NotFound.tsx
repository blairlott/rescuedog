import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const path = location.pathname.replace(/\/+$/, "") || "/";
      const candidates = Array.from(new Set([location.pathname, path, path + "/"]));
      const { data } = await supabase
        .from("content_redirects")
        .select("to_path")
        .in("from_path", candidates)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.to_path) {
        // Fire-and-forget hit counter
        supabase.rpc as any; // no-op typing guard
        window.location.replace(data.to_path);
        return;
      }
      console.error("404 Error: User attempted to access non-existent route:", location.pathname);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
