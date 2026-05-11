import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";

type Profile = any;
type Event = any;

export default function AmbassadorDashboardPage() {
  const { user, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justSignedUp = searchParams.get("welcome") === "1";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [rsvpCounts, setRsvpCounts] = useState<Record<string, number>>({});
  const [linkHealth, setLinkHealth] = useState<{ status: string; message: string | null; checked_at: string } | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login?next=/ambassador/dashboard"); return; }
    (async () => {
      const { data: p } = await supabase.from("ambassador_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!p) { navigate("/ambassador/signup"); return; }
      setProfile(p);
      const { data: ev } = await supabase.from("ambassador_events").select("*").eq("host_user_id", user.id).order("starts_at", { ascending: false });
      setEvents(ev || []);
      if (ev && ev.length) {
        const ids = ev.map((e: any) => e.id);
        const { data: rsvps } = await supabase.from("ambassador_event_rsvps").select("event_id").in("event_id", ids);
        const counts: Record<string, number> = {};
        (rsvps || []).forEach((r: any) => { counts[r.event_id] = (counts[r.event_id] || 0) + 1; });
        setRsvpCounts(counts);
      }
      const { data: hc } = await supabase
        .from("impact_health_checks")
        .select("status,message,checked_at")
        .eq("ambassador_profile_id", p.id)
        .order("checked_at", { ascending: false })
        .limit(1);
      if (hc && hc[0]) setLinkHealth(hc[0] as any);
      setLoadingData(false);
    })();
  }, [user, loading, navigate]);

  if (loading || loadingData || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const onSaveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from("ambassador_profiles").update({
      display_name: profile.display_name,
      bio: profile.bio,
      photo_url: profile.photo_url,
      instagram: profile.instagram,
      tiktok: profile.tiktok,
      website: profile.website,
      impact_tracking_url: profile.impact_tracking_url,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto py-10 px-4 w-full">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold uppercase">Ambassador Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Status: <Badge variant={profile.status === "active" ? "default" : "secondary"}>{profile.status}</Badge>
              {profile.status === "active" && (
                <>
                  {" · "}
                  <Link to={`/a/${profile.handle}`} className="underline inline-flex items-center gap-1">
                    View public page <ExternalLink className="w-3 h-3" />
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        {profile.status === "pending" && (
          <div className="border border-border bg-muted p-4 mb-8">
            <p className="text-sm font-semibold">Your application is under review.</p>
            <p className="text-sm text-muted-foreground mt-1">
              We'll email you within 2 business days. You can edit your profile while you wait.
              {!profile.impact_tracking_url && (
                <> <strong className="text-foreground">Heads up:</strong> your public page will not be published until you add an impact.com tracking URL or code below.</>
              )}
            </p>
          </div>
        )}

        {justSignedUp && !profile.impact_tracking_url && (
          <div className="border-2 border-primary p-5 mb-8">
            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Final step</p>
            <h2 className="text-xl font-bold uppercase mb-2">Join the impact.com program</h2>
            <p className="text-sm text-muted-foreground mb-4">
              We've also emailed this to you. impact.com handles all commission tracking and 1099s.
              Sign up (3 minutes), then paste your tracking link below to publish your page.
            </p>
            <Button asChild>
              <a href="https://app.impact.com/signup/none/create-new-mediapartner-account-flow.ihtml?execution=e1s1#/?viewkey=signUpPreStart" target="_blank" rel="noopener">
                Open impact.com signup <ExternalLink className="w-3 h-3 ml-2" />
              </a>
            </Button>
          </div>
        )}

        <section className="mb-12">
          <h2 className="text-xl font-bold uppercase mb-4">impact.com Tracking Link</h2>
          <div className="border border-border p-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              Don't have one yet?{" "}
              <a href="https://app.impact.com/signup/none/create-new-mediapartner-account-flow.ihtml?execution=e1s1#/?viewkey=signUpPreStart" target="_blank" rel="noopener" className="underline">
                Apply through our impact.com portal
              </a>{" "}
              and request to join the Rescue Dog Wines program. Once approved, paste your tracking URL here.
            </p>
            <div>
              <Label htmlFor="impact">Your impact.com tracking URL</Label>
              <Input id="impact" value={profile.impact_tracking_url || ""}
                onChange={e => setProfile({ ...profile, impact_tracking_url: e.target.value })}
                placeholder="https://rdwine.pxf.io/..." className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Until you add this, "Shop" buttons on your page will fall back to our standard wine shop.</p>
            </div>
            {linkHealth && profile.impact_tracking_url && (
              <div className={`text-xs p-3 border ${linkHealth.status === "ok" ? "border-green-600 text-green-700" : linkHealth.status === "warning" ? "border-yellow-600 text-yellow-700" : "border-destructive text-destructive"}`}>
                <span className="font-bold uppercase">Link health: {linkHealth.status}</span>
                {linkHealth.message && <> · {linkHealth.message}</>}
                <span className="text-muted-foreground"> · checked {new Date(linkHealth.checked_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-bold uppercase mb-4">Profile</h2>
          <div className="grid md:grid-cols-2 gap-5 border border-border p-5">
            <div className="md:col-span-2">
              <Label>Handle (locked)</Label>
              <Input value={profile.handle} disabled className="mt-1" />
            </div>
            <div>
              <Label>Display Name</Label>
              <Input value={profile.display_name || ""} onChange={e => setProfile({ ...profile, display_name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Photo URL</Label>
              <Input type="url" value={profile.photo_url || ""} onChange={e => setProfile({ ...profile, photo_url: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Bio</Label>
              <Textarea rows={4} value={profile.bio || ""} onChange={e => setProfile({ ...profile, bio: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Instagram</Label>
              <Input value={profile.instagram || ""} onChange={e => setProfile({ ...profile, instagram: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>TikTok</Label>
              <Input value={profile.tiktok || ""} onChange={e => setProfile({ ...profile, tiktok: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Website</Label>
              <Input type="url" value={profile.website || ""} onChange={e => setProfile({ ...profile, website: e.target.value })} className="mt-1" />
            </div>
          </div>
          <Button onClick={onSaveProfile} disabled={saving} className="mt-4">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile & Link"}
          </Button>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold uppercase">Tasting Events</h2>
            <Button asChild size="sm"><Link to="/ambassador/events/new"><Plus className="w-4 h-4 mr-1" />New Event</Link></Button>
          </div>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm border border-dashed border-border p-6 text-center">No events yet. Host your first tasting!</p>
          ) : (
            <div className="border border-border divide-y divide-border">
              {events.map(ev => (
                <div key={ev.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="font-bold">{ev.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ev.starts_at).toLocaleString()} · {ev.city || "TBD"} · {rsvpCounts[ev.id] || 0} RSVPs · <Badge variant="outline">{ev.status}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {ev.status === "published" && <Button asChild size="sm" variant="outline"><Link to={`/e/${ev.slug}`}>View</Link></Button>}
                    <Button asChild size="sm"><Link to={`/ambassador/events/${ev.id}/edit`}>Edit</Link></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}