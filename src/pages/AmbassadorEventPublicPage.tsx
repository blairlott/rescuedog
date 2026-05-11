import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MapPin, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AmbassadorEventPublicPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState<any>(null);
  const [host, setHost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", party_size: "1", notes: "" });

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: ev } = await supabase.from("ambassador_events").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
      setEvent(ev);
      if (ev) {
        const { data: h } = await supabase.from("ambassador_profiles").select("handle,display_name,photo_url,impact_tracking_url,bio").eq("user_id", ev.host_user_id).eq("status", "active").maybeSingle();
        setHost(h);
      }
      setLoading(false);
    })();
  }, [slug]);

  const onRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.from("ambassador_event_rsvps").insert({
      event_id: event.id,
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      party_size: parseInt(form.party_size) || 1,
      notes: form.notes || null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    setSubmitted(true);
    toast.success("RSVP confirmed! See you there.");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!event) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-md mx-auto py-20 px-4 text-center">
          <h1 className="text-2xl font-bold uppercase mb-2">Event Not Found</h1>
          <Button asChild><Link to="/ambassadors/find">Browse Ambassadors</Link></Button>
        </main>
        <Footer />
      </div>
    );
  }

  const shopLink = host?.impact_tracking_url || "/wines";
  const isExternal = !!host?.impact_tracking_url;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto py-10 px-4 w-full">
        {event.cover_image_url && <img src={event.cover_image_url} alt={event.title} className="w-full h-64 object-cover mb-8" />}
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Tasting Event</p>
        <h1 className="text-4xl font-bold uppercase mt-1">{event.title}</h1>

        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
          <span className="inline-flex items-center gap-2"><Clock className="w-4 h-4" />{new Date(event.starts_at).toLocaleString()}</span>
          {(event.venue_name || event.city) && (
            <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4" />
              {[event.venue_name, event.street_address, event.city, event.state].filter(Boolean).join(", ")}
            </span>
          )}
        </div>

        {host && (
          <div className="mt-6 p-4 border border-border flex items-center gap-4">
            {host.photo_url && <img src={host.photo_url} alt={host.display_name} className="w-14 h-14 object-cover" />}
            <div className="text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Hosted by</div>
              <Link to={`/a/${host.handle}`} className="font-bold hover:underline">{host.display_name}</Link>
            </div>
          </div>
        )}

        {event.description && <p className="mt-6 whitespace-pre-line">{event.description}</p>}

        <div className="mt-8 flex flex-wrap gap-3">
          {isExternal ? (
            <a href={shopLink} target="_blank" rel="noopener noreferrer">
              <Button size="lg">Shop This Event's Wines</Button>
            </a>
          ) : (
            <Link to={shopLink}><Button size="lg">Shop Wines</Button></Link>
          )}
        </div>

        <section className="mt-12 border-t border-border pt-8">
          <h2 className="text-2xl font-bold uppercase mb-4">RSVP</h2>
          {submitted ? (
            <p className="border border-border bg-muted p-6 text-center">You're on the list. Check your email for details!</p>
          ) : (
            <form onSubmit={onRsvp} className="space-y-4 max-w-md">
              <div><Label>Name *</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
              <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>Party size</Label><Input type="number" min="1" max="20" value={form.party_size} onChange={e => setForm({ ...form, party_size: e.target.value })} className="mt-1" /></div>
              <div><Label>Notes (allergies, questions)</Label><Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
              <Button type="submit" disabled={submitting} size="lg" className="w-full">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm RSVP"}</Button>
              <p className="text-xs text-muted-foreground">By RSVPing you confirm you are 21+ and agree to follow the host's guidance at the event.</p>
            </form>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}