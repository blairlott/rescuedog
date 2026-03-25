import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import L from "leaflet";
import { Link } from "react-router-dom";
import { useSalesAccounts, useUpsertAccount } from "@/hooks/useSalesAccounts";
import { useUserRole } from "@/hooks/useUserRole";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { US_STATES } from "@/lib/usStates";
import { GOOGLE_MAPS_API_KEY } from "@/lib/googleMaps";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const MARKER_COLORS = {
  mine: "red",
  prospect: "gold",
  others: "blue",
} as const;

const makeColorIcon = (color: string) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
  });

export default function CrmMapPage() {
  const [stateFilter, setStateFilter] = useState("");
  const [premiseFilter, setPremiseFilter] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const upsertAccount = useUpsertAccount();
  const { data: roleInfo } = useUserRole();

  const myName = roleInfo?.profile?.full_name || "";

  const { data: accounts = [] } = useSalesAccounts({
    state: stateFilter || undefined,
    premiseType: premiseFilter || undefined,
  });

  const mappable = useMemo(() => accounts.filter((a) => a.latitude && a.longitude), [accounts]);
  const unmapped = useMemo(() => accounts.filter((a) => !a.latitude && !a.longitude && a.street_address && a.city), [accounts]);

  const center: [number, number] = mappable.length > 0
    ? [mappable[0].latitude!, mappable[0].longitude!]
    : [33.749, -84.388];

  const getMarkerColor = useCallback((account: typeof accounts[0]) => {
    if (account.status === "prospect") return MARKER_COLORS.prospect;
    if (myName && account.rep_name?.toLowerCase() === myName.toLowerCase()) return MARKER_COLORS.mine;
    return MARKER_COLORS.others;
  }, [myName]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(center, 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    mappable.forEach((a) => {
      const color = getMarkerColor(a);
      const marker = L.marker([a.latitude!, a.longitude!], {
        icon: makeColorIcon(color),
      }).addTo(map);

      marker.bindPopup(`
        <div style="min-width:150px">
          <p style="font-weight:bold;margin:0 0 4px">${a.account_name}</p>
          <p style="font-size:12px;margin:0 0 2px">${a.premise_type === "on" ? "On Premise" : "Off Premise"} · ${a.status || "prospect"}</p>
          ${a.rep_name ? `<p style="font-size:12px;margin:0 0 2px">Rep: ${a.rep_name}</p>` : ""}
          ${a.city ? `<p style="font-size:12px;margin:0 0 4px">${a.city}, ${a.state}</p>` : ""}
          <a href="/crm/account/${a.id}" style="font-size:12px">View Details →</a>
        </div>
      `);
    });

    if (mappable.length > 0) {
      const bounds = L.latLngBounds(mappable.map((a) => [a.latitude!, a.longitude!]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [mappable, getMarkerColor]);

  const geocodeAll = useCallback(async () => {
    if (unmapped.length === 0) { toast.info("All accounts are already geocoded"); return; }
    setGeocoding(true);
    let success = 0;

    for (const account of unmapped) {
      const addr = [account.street_address, account.city, account.state, account.zip].filter(Boolean).join(", ");
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await res.json();
        if (data.results?.[0]?.geometry?.location) {
          const { lat, lng } = data.results[0].geometry.location;
          await upsertAccount.mutateAsync({ id: account.id, account_name: account.account_name, latitude: lat, longitude: lng });
          success++;
        }
      } catch { /* skip */ }
    }

    toast.success(`Geocoded ${success} of ${unmapped.length} accounts`);
    setGeocoding(false);
  }, [unmapped, upsertAccount]);

  return (
    <div className="p-0" style={{ height: "100%" }}>
      <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
        <h2 className="font-bold text-foreground">Account Map</h2>
        <Select value={stateFilter} onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All States" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={premiseFilter} onValueChange={(v) => setPremiseFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="on">On Premise</SelectItem>
            <SelectItem value="off">Off Premise</SelectItem>
          </SelectContent>
        </Select>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> My Accounts</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-400" /> Prospects</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-blue-500" /> Other Reps</span>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <span className="text-sm text-muted-foreground">
            {mappable.length} of {accounts.length} mapped
          </span>
          {unmapped.length > 0 && (
            <Button variant="outline" size="sm" onClick={geocodeAll} disabled={geocoding} className="gap-1">
              {geocoding ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
              {geocoding ? "Geocoding..." : `Geocode ${unmapped.length} Accounts`}
            </Button>
          )}
        </div>
      </div>

      <div
        ref={mapContainerRef}
        style={{ height: "calc(100vh - 120px)", width: "100%" }}
      />
    </div>
  );
}
