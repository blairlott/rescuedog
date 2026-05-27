import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Seo } from "@/components/Seo";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "loading" | "ready" | "already" | "invalid" | "submitting" | "done" | "error";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: SUPABASE_KEY },
    })
      .then(r => r.json())
      .then(j => {
        if (j.valid === true) setState("ready");
        else if (j.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) { setState("error"); return; }
    if ((data as any)?.reason === "already_unsubscribed") setState("already");
    else setState("done");
  };

  return (
    <>
      <Seo noindex title="Unsubscribe" />
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 max-w-md mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-bold uppercase mb-6">Email Preferences</h1>
        {state === "loading" && <Loader2 className="w-6 h-6 animate-spin mx-auto" />}
        {state === "ready" && (
          <>
            <p className="text-muted-foreground mb-6">Click below to unsubscribe from Rescue Dog Wines emails.</p>
            <Button onClick={confirm} size="lg">Confirm Unsubscribe</Button>
          </>
        )}
        {state === "submitting" && <Loader2 className="w-6 h-6 animate-spin mx-auto" />}
        {state === "done" && <p className="text-muted-foreground">You've been unsubscribed. Sorry to see you go.</p>}
        {state === "already" && <p className="text-muted-foreground">You're already unsubscribed.</p>}
        {state === "invalid" && <p className="text-muted-foreground">This unsubscribe link is invalid or expired.</p>}
        {state === "error" && <p className="text-destructive">Something went wrong. Please try again later.</p>}
      </main>
      <Footer />
    </div>
    </>
  );
}