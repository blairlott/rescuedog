import { useState, useMemo, useCallback, useEffect } from "react";
import { useSalesAccounts, useUpsertAccount, type SalesAccount } from "@/hooks/useSalesAccounts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { US_STATES } from "@/lib/usStates";
import { assertAllowedMapsReferrer } from "@/lib/googleMaps";
import { geocodeAddress, computeOptimizedRoute } from "@/lib/googleMapsClient";
import { MapPin, Navigation, ExternalLink, Search, Clock, ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DirectionsLeg {
  distance: { text: string; value: number };
  duration: { text: string; value: number };
  start_address: string;
  end_address: string;
}

interface RouteResult {
  legs: DirectionsLeg[];
  totalDistance: string;
  totalDuration: string;
  optimizedOrder: number[];
}

export default function CrmRoutePlanner() {
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const { data: accounts = [] } = useSalesAccounts({ state: stateFilter || undefined, search: search || undefined });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startAddress, setStartAddress] = useState("");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const upsertAccount = useUpsertAccount();

  useEffect(() => { assertAllowedMapsReferrer(); }, []);

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
    setRouteResult(null);
  };

  const selectAll = () => {
    if (selected.size === addressable.length) setSelected(new Set());
    else setSelected(new Set(addressable.map((a) => a.id)));
    setRouteResult(null);
  };

  const selectedAccounts = useMemo(
    () => addressable.filter((a) => selected.has(a.id)),
    [addressable, selected]
  );

  const getAddress = (a: SalesAccount) =>
    [a.street_address, a.city, a.state, a.zip].filter(Boolean).join(", ");

  // Geocode accounts that don't have lat/lng
  const geocodeAccounts = useCallback(async () => {
    const toGeocode = selectedAccounts.filter((a) => !a.latitude || !a.longitude);
    if (toGeocode.length === 0) return;

    setGeocoding(true);
    let geocoded = 0;

    for (const account of toGeocode) {
      const addr = getAddress(account);
      try {
        const hit = await geocodeAddress(addr);
        if (hit) {
          await upsertAccount.mutateAsync({ id: account.id, account_name: account.account_name, latitude: hit.lat, longitude: hit.lng });
          geocoded++;
        }
      } catch { /* skip failed geocodes */ }
    }

    if (geocoded > 0) toast.success(`Geocoded ${geocoded} account${geocoded > 1 ? "s" : ""}`);
    setGeocoding(false);
  }, [selectedAccounts, upsertAccount]);

  // Optimize route via Google Directions API
  const optimizeRoute = useCallback(async () => {
    if (selectedAccounts.length < 2) {
      toast.error("Select at least 2 accounts");
      return;
    }

    setOptimizing(true);
    await geocodeAccounts();

    const waypoints = selectedAccounts.map((a) => getAddress(a));
    const origin = startAddress || waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const middleWaypoints = startAddress ? waypoints : waypoints.slice(1, -1);

    try {
      const route = await computeOptimizedRoute({ origin, destination, intermediates: middleWaypoints });
      if (!route) {
        toast.error("Routes API unavailable. Opening Google Maps instead.");
        openInGoogleMaps();
        setOptimizing(false);
        return;
      }

      const legs: DirectionsLeg[] = route.legs.map((l) => ({
        distance: { text: `${(l.distanceMeters / 1609.34).toFixed(1)} mi`, value: l.distanceMeters },
        duration: { text: formatDuration(l.durationSeconds), value: l.durationSeconds },
        start_address: l.startAddress,
        end_address: l.endAddress,
      }));

      setRouteResult({
        legs,
        totalDistance: `${(route.totalDistanceMeters / 1609.34).toFixed(1)} mi`,
        totalDuration: formatDuration(route.totalDurationSeconds),
        optimizedOrder: route.optimizedWaypointOrder,
      });

      toast.success("Route optimized!");
    } catch {
      toast.error("Could not optimize route. Opening in Google Maps instead.");
      openInGoogleMaps();
    }

    setOptimizing(false);
  }, [selectedAccounts, startAddress, geocodeAccounts]);

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  };

  const openInGoogleMaps = () => {
    if (selectedAccounts.length === 0) return;
    const waypoints = selectedAccounts.map((a) =>
      encodeURIComponent(getAddress(a))
    );
    const origin = startAddress ? encodeURIComponent(startAddress) : waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const middle = startAddress ? waypoints : waypoints.slice(1, -1);
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (middle.length > 0) url += `&waypoints=${middle.join("|")}`;
    url += "&travelmode=driving";
    window.open(url, "_blank");
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Route Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select accounts, optimize your route, and navigate via Google Maps
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={openInGoogleMaps}
            disabled={selected.size === 0}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" /> Open in Maps
          </Button>
          <Button
            onClick={optimizeRoute}
            disabled={selected.size < 2 || optimizing}
            className="gap-2"
          >
            {optimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {optimizing ? "Optimizing..." : "Optimize Route"}
          </Button>
        </div>
      </div>

      {/* Starting point */}
      <div className="bg-card border border-border p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">Starting Address (optional)</label>
        <Input
          placeholder="e.g. 123 Main St, Atlanta, GA 30301"
          value={startAddress}
          onChange={(e) => { setStartAddress(e.target.value); setRouteResult(null); }}
        />
        <p className="text-xs text-muted-foreground">Leave blank to start from the first selected account</p>
      </div>

      {/* Route Result */}
      {routeResult && (
        <div className="bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-brand">Optimized Route</h3>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-foreground">
                <MapPin className="h-4 w-4 text-muted-foreground" /> {routeResult.totalDistance}
              </span>
              <span className="flex items-center gap-1 text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" /> {routeResult.totalDuration}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {routeResult.legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  {i < routeResult.legs.length - 1 && <ArrowDown className="h-4 w-4 text-muted-foreground mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{leg.start_address}</p>
                  <p className="text-xs text-muted-foreground">{leg.distance.text} · {leg.duration.text}</p>
                </div>
              </div>
            ))}
            {/* Final destination */}
            <div className="flex items-center gap-3 py-2">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                {routeResult.legs.length + 1}
              </div>
              <p className="text-sm text-foreground truncate">
                {routeResult.legs[routeResult.legs.length - 1]?.end_address}
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={openInGoogleMaps}>
            <Navigation className="h-4 w-4" /> Navigate This Route in Google Maps
          </Button>
        </div>
      )}

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
        {geocoding && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Geocoding...</span>}
      </div>

      {/* Account list */}
      <div className="border border-border divide-y divide-border">
        {addressable.map((a) => {
          const addr = getAddress(a);
          const isSelected = selected.has(a.id);
          const hasCoords = !!(a.latitude && a.longitude);
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                isSelected ? "bg-primary/5" : "hover:bg-muted/50"
              }`}
              onClick={() => toggleSelect(a.id)}
            >
              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(a.id)} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{a.account_name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{addr}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {hasCoords && <span className="text-xs text-primary">📍</span>}
                <span className="text-xs text-muted-foreground">
                  {a.premise_type === "on" ? "On" : "Off"} Premise
                </span>
              </div>
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
