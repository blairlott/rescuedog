import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Phone, Globe, Loader2, Search } from "lucide-react";
import { SuggestRetailerDialog } from "@/components/locator/SuggestRetailerDialog";
import { Link } from "react-router-dom";
import { toast } from "sonner";

// Fix Leaflet default icons in Vite
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Retailer = {
  id: string;
  account_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  premise_type: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_miles: number | null;
};

function FlyTo({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 10, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function StoreLocatorPage() {
  const [zip, setZip] = useState("");
  const [premise, setPremise] = useState<"all" | "off" | "on">("all");
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [results, setResults] = useState<Retailer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\d{5}$/.test(zip)) {
      toast.error("Please enter a 5-digit ZIP code");
      return;
    }
    setLoading(true);
    try {
      // 1. Geocode
      const geoRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geocode-zip?zip=${zip}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!geoRes.ok) {
        toast.error("Could not locate that ZIP code");
        setLoading(false);
        return;
      }
      const geo = await geoRes.json();
      setCenter([geo.lat, geo.lng]);

      // 2. Get compliant retailer set (3+ unaffiliated, public)
      const premiseFilter = premise === "all" ? null : premise;
      const { data, error } = await supabase.rpc("compliant_retailer_set", {
        _latitude: geo.lat,
        _longitude: geo.lng,
        _min_count: 3,
        _premise_filter: premiseFilter,
      });

      if (error) {
        console.error(error);
        toast.error("Search failed. Please try again.");
        setLoading(false);
        return;
      }

      const retailers = (data ?? []) as Retailer[];
      setResults(retailers);
      setSearched(true);

      // 3. Log the search (fire-and-forget)
      supabase.from("locator_searches").insert([
        {
          zip,
          latitude: geo.lat,
          longitude: geo.lng,
          radius_miles: 25,
          premise_filter: premiseFilter,
          results_count: retailers.length,
          referrer: typeof document !== "undefined" ? document.referrer : null,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const validResults = useMemo(
    () => results.filter((r) => r.latitude != null && r.longitude != null),
    [results]
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="py-10 md:py-14 border-b border-border">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">
              Shop in Stores
            </p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">Find Rescue Dog Wines Near You</h1>
            <p className="text-foreground mb-6">
              Enter your ZIP to find at least three retailers and restaurants carrying Rescue Dog
              Wines near you. Don't see your favorite store?{" "}
              <SuggestRetailerDialog
                trigger={<button className="text-primary underline">Suggest a retailer</button>}
              />
              .
            </p>

            <form onSubmit={search} className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{5}"
                placeholder="Enter ZIP code"
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="text-center sm:text-left"
              />
              <select
                value={premise}
                onChange={(e) => setPremise(e.target.value as any)}
                className="border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All locations</option>
                <option value="off">Retail only</option>
                <option value="on">Restaurants only</option>
              </select>
              <Button type="submit" disabled={loading} className="min-w-[120px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <><Search className="h-4 w-4 mr-2" /> Search</>
                )}
              </Button>
            </form>
          </div>
        </section>

        {/* Results */}
        <section className="py-8">
          <div className="container mx-auto px-4">
            {searched && results.length === 0 && (
              <div className="text-center py-12">
                <p className="text-lg mb-4">
                  We don't have a retailer near {zip} yet — but you can still order online.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button asChild>
                    <Link to="/wines">Shop online</Link>
                  </Button>
                  <SuggestRetailerDialog />
                </div>
              </div>
            )}

            {searched && results.length > 0 && (
              <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
                {/* List */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  <p className="text-sm text-muted-foreground mb-2">
                    {results.length} location{results.length === 1 ? "" : "s"} near {zip}
                  </p>
                  {results.map((r) => (
                    <div key={r.id} className="border border-border p-4 bg-card">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-foreground">{r.account_name}</h3>
                        {r.distance_miles != null && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.distance_miles.toFixed(1)} mi
                          </span>
                        )}
                      </div>
                      {r.premise_type && (
                        <span className="inline-block text-[10px] uppercase tracking-brand text-muted-foreground mt-1">
                          {r.premise_type === "on" ? "Restaurant / bar" : "Retail"}
                        </span>
                      )}
                      <div className="text-sm mt-2 space-y-1">
                        {r.street_address && (
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                            <span>
                              {r.street_address}
                              {r.city ? `, ${r.city}` : ""}
                              {r.state ? `, ${r.state}` : ""}
                              {r.zip ? ` ${r.zip}` : ""}
                            </span>
                          </div>
                        )}
                        {r.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a>
                          </div>
                        )}
                        {r.website && (
                          <div className="flex items-center gap-2">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            <a href={r.website} target="_blank" rel="noreferrer" className="hover:underline truncate">
                              {r.website.replace(/^https?:\/\//, "")}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
                    Retailers shown are independent and unaffiliated. Rescue Dog Wines does not pay
                    for or control retailer placement.
                  </p>
                </div>

                {/* Map */}
                <div className="h-[600px] border border-border">
                  {center && (
                    <MapContainer
                      center={center}
                      zoom={10}
                      scrollWheelZoom={false}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <FlyTo center={center} />
                      {validResults.map((r) => (
                        <Marker key={r.id} position={[r.latitude!, r.longitude!]}>
                          <Popup>
                            <strong>{r.account_name}</strong>
                            <br />
                            {r.street_address}
                            <br />
                            {r.city}, {r.state} {r.zip}
                          </Popup>
                        </Marker>
                      ))}
                    </MapContainer>
                  )}
                </div>
              </div>
            )}

            {!searched && (
              <div className="text-center py-12 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Enter your ZIP code to find Rescue Dog Wines near you.</p>
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}