import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Loader2, Instagram, Globe, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function AmbassadorPublicProfilePage() {
  const { handle } = useParams();
  const [profile, setProfile] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) return;
    (async () => {
      const { data: p } = await supabase.from("ambassador_profiles").select("*").eq("handle", handle).eq("status", "active").maybeSingle();
      setProfile(p);
      if (p) {
        const { data: ev } = await supabase
          .from("ambassador_events").select("*")
          .eq("host_user_id", p.user_id).eq("status", "published")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at");
        setEvents(ev || []);
      }
      setLoading(false);
    })();
  }, [handle]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-md mx-auto py-20 px-4 text-center">
          <h1 className="text-2xl font-bold uppercase mb-2">Ambassador Not Found</h1>
          <p className="text-muted-foreground mb-6">This page may have been removed or is not yet active.</p>
          <Button asChild><Link to="/ambassadors/find">Find an Ambassador</Link></Button>
        </main>
        <Footer />
      </div>
    );
  }

  const shopLink = profile.impact_tracking_url || "/wines";
  const isExternal = !!profile.impact_tracking_url;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="bg-muted py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            {profile.photo_url && (
              <img src={profile.photo_url} alt={profile.display_name} className="w-32 h-32 mx-auto mb-6 object-cover" />
            )}
            <h1 className="text-4xl md:text-5xl font-bold uppercase">{profile.display_name}</h1>
            <p className="text-sm text-muted-foreground uppercase tracking-wider mt-2">Rescue Dog Wines Ambassador</p>
            {profile.bio && <p className="mt-6 text-lg max-w-xl mx-auto">{profile.bio}</p>}

            <div className="flex justify-center gap-4 mt-6 text-sm">
              {profile.instagram && <a href={`https://instagram.com/${profile.instagram.replace("@","")}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline"><Instagram className="w-4 h-4" />{profile.instagram}</a>}
              {profile.tiktok && <a href={`https://tiktok.com/@${profile.tiktok.replace("@","")}`} target="_blank" rel="noopener" className="hover:underline">TikTok {profile.tiktok}</a>}
              {profile.website && <a href={profile.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 hover:underline"><Globe className="w-4 h-4" />Website</a>}
            </div>

            <div className="mt-10">
              {isExternal ? (
                <a href={shopLink} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="text-base px-10">Shop with {profile.display_name.split(" ")[0]}</Button>
                </a>
              ) : (
                <Link to={shopLink}>
                  <Button size="lg" className="text-base px-10">Shop Wines</Button>
                </Link>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                <Link to="/ambassadors/disclosure" className="underline">Material connection disclosure</Link>
              </p>
            </div>
          </div>
        </section>

        {events.length > 0 && (
          <section className="py-12 px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold uppercase mb-6 flex items-center gap-2"><Calendar className="w-5 h-5" />Upcoming Tastings</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {events.map(ev => (
                  <Link key={ev.id} to={`/e/${ev.slug}`} className="block border border-border p-5 hover:bg-muted transition">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">{new Date(ev.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div className="font-bold text-lg mt-1">{ev.title}</div>
                    {ev.city && <div className="text-sm text-muted-foreground mt-1">{ev.venue_name ? `${ev.venue_name} · ` : ""}{ev.city}, {ev.state}</div>}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}