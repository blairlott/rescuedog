import { useState, useMemo } from "react";
import { useSalesAccounts, type SalesAccount } from "@/hooks/useSalesAccounts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { US_STATES } from "@/lib/usStates";
import { MapPin, Navigation, ExternalLink, GripVertical, Search } from "lucide-react";

export default function CrmRoutePlanner() {
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data: accounts = [] } = useSalesAccounts({ state: stateFilter || undefined, search: search || undefined });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startAddress, setStartAddress] = useState("");

  const addressable = useMemo(
    () => accounts.filter((a) => a.street_address && a.city && a.state),
    [accounts]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === addressable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(addressable.map((a) => a.id)));
    }
  };

  const selectedAccounts = useMemo(
    () => addressable.filter((a) => selected.has(a.id)),
    [addressable, selected]
  );

  const buildGoogleMapsUrl = () => {
    if (selectedAccounts.length === 0) return null;

    const waypoints = selectedAccounts.map((a) =>
      encodeURIComponent([a.street_address, a.city, a.state, a.zip].filter(Boolean).join(", "))
    );

    const origin = startAddress
      ? encodeURIComponent(startAddress)
      : waypoints[0];

    const destination = waypoints[waypoints.length - 1];
    const middle = startAddress ? waypoints : waypoints.slice(1, -1);

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (middle.length > 0) {
      url += `&waypoints=${middle.join("|")}`;
    }
    url += "&travelmode=driving";
    return url;
  };

  const mapsUrl = buildGoogleMapsUrl();

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Route Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select accounts to plan your visit route via Google Maps
          </p>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <Button className="gap-2">
              <Navigation className="h-4 w-4" /> Open Route in Google Maps
              <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        )}
      </div>

      {/* Starting point */}
      <div className="bg-card border border-border p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">Starting Address (optional)</label>
        <Input
          placeholder="e.g. 123 Main St, Atlanta, GA 30301"
          value={startAddress}
          onChange={(e) => setStartAddress(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave blank to start from the first selected account</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selected.size === addressable.length ? "Deselect All" : "Select All"}
        </Button>
        <span className="text-sm text-muted-foreground">{selected.size} selected</span>
      </div>

      {/* Account list */}
      <div className="border border-border divide-y divide-border">
        {addressable.map((a) => {
          const addr = [a.street_address, a.city, a.state, a.zip].filter(Boolean).join(", ");
          const isSelected = selected.has(a.id);
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                isSelected ? "bg-primary/5" : "hover:bg-muted/50"
              }`}
              onClick={() => toggleSelect(a.id)}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(a.id)} />
              {isSelected && (
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{a.account_name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{addr}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {a.premise_type === "on" ? "On" : "Off"} Premise
              </span>
            </div>
          );
        })}
        {addressable.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-sm">No accounts with addresses found</div>
        )}
      </div>
    </div>
  );
}
