import { useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { Link } from "react-router-dom";
import { useSalesAccounts } from "@/hooks/useSalesAccounts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { US_STATES } from "@/lib/usStates";
import { Badge } from "@/components/ui/badge";
import "leaflet/dist/leaflet.css";

// Fix default marker icons
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
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

export default function CrmMapPage() {
  const [stateFilter, setStateFilter] = useState("");
  const [premiseFilter, setPremiseFilter] = useState("");

  const { data: accounts = [] } = useSalesAccounts({
    state: stateFilter || undefined,
    premiseType: premiseFilter || undefined,
  });

  const mappable = useMemo(
    () => accounts.filter((a) => a.latitude && a.longitude),
    [accounts]
  );

  const center: [number, number] = mappable.length > 0
    ? [mappable[0].latitude!, mappable[0].longitude!]
    : [33.749, -84.388]; // Default to Atlanta

  return (
    <div className="h-full flex flex-col">
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
        <div className="text-sm text-muted-foreground ml-auto">
          {mappable.length} of {accounts.length} accounts mapped
          {accounts.length > mappable.length && (
            <span className="text-xs ml-1">(geocode addresses to show more)</span>
          )}
        </div>
      </div>

      <div className="flex-1 relative" style={{ minHeight: "500px" }}>
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
