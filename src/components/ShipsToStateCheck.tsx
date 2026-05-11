import { useEffect, useState } from "react";
import { Check, X, MapPin, ChevronDown } from "lucide-react";
import { SHIPS_TO_STATES, NO_SHIP_STATES, ALL_STATES, canShipTo } from "@/lib/wineShippingStates";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STORAGE_KEY = "rdw_ship_state";

export function useShipState() {
  const [state, setStateInternal] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const setState = (code: string | null) => {
    setStateInternal(code);
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  };
  return { state, setState, canShip: canShipTo(state) };
}

export function ShipsToStateCheck({ compact = false }: { compact?: boolean }) {
  const { state, setState, canShip } = useShipState();
  const [open, setOpen] = useState(false);

  // Auto-prompt once if not set (after 1.5s on PDP)
  useEffect(() => {
    if (!state) {
      const t = setTimeout(() => setOpen(true), 100);
      return () => clearTimeout(t);
    }
  }, [state]);

  const stateName = state
    ? (SHIPS_TO_STATES[state]?.name || NO_SHIP_STATES[state] || state)
    : null;

  if (!open && state) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 ${compact ? "text-xs" : "text-sm"} px-3 py-2 border ${canShip ? "border-emerald-600/40 bg-emerald-50 text-emerald-900" : "border-destructive/40 bg-destructive/5 text-destructive"} hover:opacity-90`}
      >
        {canShip ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        <span>
          {canShip ? "Ships to" : "Cannot ship to"} <strong>{stateName}</strong>
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
    );
  }

  return (
    <div className={`border border-border bg-background p-3 ${compact ? "text-xs" : "text-sm"}`}>
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4 text-primary" />
        <span className="font-bold text-foreground">Where are we shipping?</span>
      </div>
      <p className="text-muted-foreground text-xs mb-2">
        Wine shipping laws vary by state. Pick yours so we can confirm we deliver.
      </p>
      <Select value={state || ""} onValueChange={(v) => { setState(v); setOpen(false); }}>
        <SelectTrigger><SelectValue placeholder="Select your state" /></SelectTrigger>
        <SelectContent className="max-h-72">
          {ALL_STATES.map(s => (
            <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {state && !canShip && (
        <p className="text-xs text-destructive mt-2">
          Sorry — direct wine shipping isn't permitted to {stateName} yet. Use our <a href="/store-locator" className="underline">store locator</a> to find us nearby.
        </p>
      )}
    </div>
  );
}
