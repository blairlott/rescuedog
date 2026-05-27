import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

const blank = {
  title: "", description: "", venue_name: "", street_address: "", city: "", state: "", zip: "",
  starts_at: "", ends_at: "", cover_image_url: "", max_attendees: "", status: "draft",
};

export default function AmbassadorEventEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { user, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<any>(blank);
  const [rsvps, setRsvps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/login?next=/ambassador/dashboard"); return; }
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase.from("ambassador_events").select("*").eq("id", id!).maybeSingle();
      if (error || !data) { toast.error("Event not found"); navigate("/ambassador/dashboard"); return; }
      setForm({
        ...data,
        starts_at: data.starts_at ? new Date(data.starts_at).toISOString().slice(0, 16) : "",
        ends_at: data.ends_at ? new Date(data.ends_at).toISOString().slice(0, 16) : "",
        max_attendees: data.max_attendees?.toString() || "",
      });
      const { data: r } = await supabase.from("ambassador_event_rsvps").select("*").eq("event_id", id!).order("created_at");
      setRsvps(r || []);
    })();
  }, [id, isNew, user, loading, navigate]);

  if (loading || !user) return null;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.starts_at) { toast.error("Title and start time are required"); return; }
    setBusy(true);
    const payload: any = {
      host_user_id: user.id,
      title: form.title,
      description: form.description || null,
      venue_name: form.venue_name || null,
      street_address: form.street_address || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      cover_image_url: form.cover_image_url || null,
      max_attendees: form.max_attendees ? parseInt(form.max_attendees) : null,
      status: form.status,
    };
    if (isNew) {
      payload.slug = `${slugify(form.title)}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from("ambassador_events").insert(payload);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Event created");
    } else {
      const { error } = await supabase.from("ambassador_events").update(payload).eq("id", id!);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Event saved");
    }
    navigate("/ambassador/dashboard");
  };

  const toggleAttended = async (rsvpId: string, attended: boolean) => {
    await supabase.from("ambassador_event_rsvps").update({ attended }).eq("id", rsvpId);
    setRsvps(rsvps.map(r => r.id === rsvpId ? { ...r, attended } : r));
  };

  return (
    <>
      <Seo noindex title="Ambassador Event Editor" />
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto py-10 px-4 w-full">
        <h1 className="text-3xl font-bold uppercase mb-6">{isNew ? "New Event" : "Edit Event"}</h1>
        <form onSubmit={onSave} className="space-y-4">
          <div><Label>Title *</Label><Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
          <div><Label>Description</Label><Textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Starts at *</Label><Input type="datetime-local" required value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className="mt-1" /></div>
            <div><Label>Ends at</Label><Input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className="mt-1" /></div>
          </div>
          <div><Label>Venue Name</Label><Input value={form.venue_name} onChange={e => setForm({ ...form, venue_name: e.target.value })} className="mt-1" /></div>
          <div><Label>Street Address</Label><Input value={form.street_address} onChange={e => setForm({ ...form, street_address: e.target.value })} className="mt-1" /></div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
            <div><Label>State</Label><Input maxLength={2} value={form.state} onChange={e => setForm({ ...form, state: e.target.value.toUpperCase() })} className="mt-1" /></div>
            <div><Label>ZIP</Label><Input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Cover Image URL</Label><Input type="url" value={form.cover_image_url} onChange={e => setForm({ ...form, cover_image_url: e.target.value })} className="mt-1" /></div>
            <div><Label>Max Attendees</Label><Input type="number" min="1" value={form.max_attendees} onChange={e => setForm({ ...form, max_attendees: e.target.value })} className="mt-1" /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (private)</SelectItem>
                <SelectItem value="published">Published (public)</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Event"}</Button>
            <Button type="button" variant="outline" onClick={() => navigate("/ambassador/dashboard")}>Cancel</Button>
          </div>
        </form>

        {!isNew && rsvps.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold uppercase mb-4">RSVPs ({rsvps.length})</h2>
            <div className="border border-border divide-y divide-border">
              {rsvps.map(r => (
                <div key={r.id} className="p-3 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm">
                    <div className="font-semibold">{r.name} · party of {r.party_size}</div>
                    <div className="text-xs text-muted-foreground">{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                    {r.notes && <div className="text-xs italic mt-1">"{r.notes}"</div>}
                  </div>
                  <Button size="sm" variant={r.attended ? "default" : "outline"} onClick={() => toggleAttended(r.id, !r.attended)}>
                    {r.attended ? "Attended ✓" : "Mark attended"}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
    </>
  );
}