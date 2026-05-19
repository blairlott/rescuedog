import { useEffect, useState } from "react";

const STORAGE_KEY = "preview_unlock_v23";
const USERNAME = "RDW";
const PASSWORD = "Doghouse2026";

/**
 * Password gate used to lock the in-progress /v2 and /v3 previews
 * while the rest of the site stays open. Same team credentials as
 * the legacy full-site SitePasswordGate, but a separate storage key
 * so unlocking the previews does not affect anything else.
 */
export function PreviewPasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return (
      sessionStorage.getItem(STORAGE_KEY) === "1" ||
      localStorage.getItem(STORAGE_KEY) === "1"
    );
  });
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("unlock") === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    }
  }, []);

  if (unlocked) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (u.trim().toLowerCase() === USERNAME.toLowerCase() && p === PASSWORD) {
      (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, "1");
      setUnlocked(true);
    } else {
      setErr("Incorrect login");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black text-white p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border border-white/20 p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rescue Dog Wines</h1>
          <p className="text-sm text-white/60 mt-1">Private preview — team access only</p>
        </div>
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wider text-white/60">Login</label>
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            className="w-full bg-transparent border border-white/30 px-3 py-2 focus:border-white outline-none"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wider text-white/60">Password</label>
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            className="w-full bg-transparent border border-white/30 px-3 py-2 focus:border-white outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me on this device
        </label>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button type="submit" className="w-full bg-white text-black py-2 font-semibold hover:bg-white/90">
          Enter preview
        </button>
      </form>
    </div>
  );
}