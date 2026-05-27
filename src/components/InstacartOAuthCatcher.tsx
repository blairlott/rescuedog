import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Drops into the rescuedogwines.com root to intercept Instacart's OAuth redirect.
 * Instacart redirects to https://rescuedogwines.com/?code=... — this catches that,
 * POSTs the code to the oauth-instacart-callback edge function, and shows the
 * resulting refresh_token so it can be pasted into Lovable Cloud secrets.
 *
 * Renders nothing unless ?code= is present in the URL.
 */
export function InstacartOAuthCatcher() {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "exchanging" }
    | { status: "ok"; refresh_token: string }
    | { status: "err"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const oauthError = params.get("error");
    // Heuristic: only treat as Instacart OAuth if URL has just code (+ optional state/error)
    // and no other unrelated query params from normal site usage.
    if (!code && !oauthError) return;

    if (oauthError) {
      setState({ status: "err", message: oauthError });
      return;
    }

    setState({ status: "exchanging" });
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState({ status: "err", message: "Sign in as an admin before completing Instacart OAuth." });
        return;
      }
      const { data, error } = await supabase.functions.invoke("oauth-instacart-callback", {
        body: { code, redirect_uri: "https://rescuedogwines.com/" },
      });
      if (!error && (data as any)?.refresh_token) {
        setState({ status: "ok", refresh_token: (data as any).refresh_token });
      } else {
        setState({ status: "err", message: error?.message || JSON.stringify(data).slice(0, 500) });
      }
    })();
  }, []);

  if (state.status === "idle") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "-apple-system,Segoe UI,Roboto,sans-serif",
      }}
    >
      <div style={{ background: "#fff", maxWidth: 720, width: "100%", padding: 32 }}>
        <h1 style={{ margin: "0 0 12px", color: "#111" }}>Instacart OAuth</h1>
        {state.status === "exchanging" && <p>Exchanging code for refresh token…</p>}
        {state.status === "ok" && (
          <>
            <p style={{ color: "#0a7c2f", fontWeight: 700 }}>Success — copy this refresh token:</p>
            <pre
              style={{
                background: "#f4f4f4",
                padding: 12,
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
                userSelect: "all",
              }}
            >
              {state.refresh_token}
            </pre>
            <p style={{ color: "#666", fontSize: 14 }}>
              Paste this into Lovable Cloud as <code>INSTACART_ADS_REFRESH_TOKEN</code>.
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(state.refresh_token);
              }}
              style={{ padding: "8px 16px", background: "#c30017", color: "#fff", border: 0, cursor: "pointer" }}
            >
              Copy
            </button>
            <button
              onClick={() => {
                window.history.replaceState({}, "", "/");
                window.location.reload();
              }}
              style={{ padding: "8px 16px", background: "#111", color: "#fff", border: 0, cursor: "pointer", marginLeft: 8 }}
            >
              Done
            </button>
          </>
        )}
        {state.status === "err" && (
          <>
            <p style={{ color: "#c30017", fontWeight: 700 }}>Exchange failed</p>
            <pre style={{ background: "#f4f4f4", padding: 12, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {state.message}
            </pre>
            <button
              onClick={() => {
                window.history.replaceState({}, "", "/");
                window.location.reload();
              }}
              style={{ padding: "8px 16px", background: "#111", color: "#fff", border: 0, cursor: "pointer" }}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}