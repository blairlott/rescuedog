import { useState, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { useSalesAccounts, useUpsertAccount } from "@/hooks/useSalesAccounts";
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

const premiseIcon = (type: string) =>
  new L.Icon({
    iconUrl: type === "on"
      ? "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png"
      : "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
  });

export default function CrmMapPage() {
  const [stateFilter, setStateFilter] = useState("");
  const [premiseFilter, setPremiseFilter] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const upsertAccount = useUpsertAccount();

  const { data: accounts = [] } = useSalesAccounts({
    state: stateFilter || undefined,
    premiseType: premiseFilter || undefined,
  });

  const mappable = useMemo(() => accounts.filter((a) => a.latitude && a.longitude), [accounts]);
  const unmapped = useMemo(() => accounts.filter((a) => !a.latitude && !a.longitude && a.street_address && a.city), [accounts]);

  const center: [number, number] = mappable.length > 0
    ? [mappable[0].latitude!, mappable[0].longitude!]
    : [33.749, -84.388];

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
    <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
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

      <div className="flex-1 relative" style={{ minHeight: "calc(100vh - 120px)" }}>
        <MapContainer center={center} zoom={8} className="absolute inset-0 z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mappable.map((a) => (
            <Marker key={a.id} position={[a.latitude!, a.longitude!]} icon={premiseIcon(a.premise_type || "off")}>
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold">{a.account_name}</p>
                  <Badge variant="outline" className="text-xs">{a.premise_type === "on" ? "On Premise" : "Off Premise"}</Badge>
                  {a.city && <p className="text-xs">{a.city}, {a.state}</p>}
                  <Link to={`/crm/account/${a.id}`} className="text-xs text-primary hover:underline block">View Details →</Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
