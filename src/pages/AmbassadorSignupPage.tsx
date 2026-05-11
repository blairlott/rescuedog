import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";

export default function AmbassadorSignupPage() {
  const { user, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    handle: "",
    display_name: "",
    bio: "",
    photo_url: "",
    instagram: "",
    tiktok: "",
    website: "",
  });

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    supabase.from("ambassador_profiles").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setHasProfile(true);
          navigate("/ambassador/dashboard");
        }
      });
  }, [user, loading, navigate]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-md mx-auto py-16 px-4 text-center">
          <h1 className="text-2xl font-bold uppercase mb-4">Sign In to Apply</h1>
          <p className="text-muted-foreground mb-6">You need an account to become a Rescue Ambassador.</p>
          <div className="flex flex-col gap-3">
            <Button asChild><Link to={`/signup?next=/ambassador/signup`}>Create Account</Link></Button>
            <Button asChild variant="outline"><Link to={`/login?next=/ambassador/signup`}>Sign In</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { toast.error("You must agree to the Ambassador Guidelines"); return; }
    const handleClean = form.handle.toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (handleClean.length < 3) { toast.error("Handle must be at least 3 characters (letters, numbers, hyphens)"); return; }
    setSubmitting(true);
    const { error } = await supabase.from("ambassador_profiles").insert({
      user_id: user.id,
      handle: handleClean,
      display_name: form.display_name,
      bio: form.bio || null,
      photo_url: form.photo_url || null,
      instagram: form.instagram || null,
      tiktok: form.tiktok || null,
      website: form.website || null,
      status: "pending",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "That handle is taken — try another" : error.message);
      return;
    }
    toast.success("Application submitted! We'll review and email you shortly.");
    navigate("/ambassador/dashboard");
  };

  if (hasProfile) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold uppercase mb-2">Ambassador Application</h1>
        <p className="text-muted-foreground mb-8">Tell us about yourself. Once approved, your storefront will be live at <code className="bg-muted px-1.5">rescuedogwines.com/a/your-handle</code></p>
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <Label htmlFor="handle">Handle *</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">/a/</span>
              <Input id="handle" required value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="jane-doe" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Lowercase letters, numbers, hyphens. 3+ characters.</p>
          </div>
          <div>
            <Label htmlFor="display_name">Display Name *</Label>
            <Input id="display_name" required value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Jane Doe" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" rows={4} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell visitors about yourself, why you love rescue dogs, and what wines you recommend." className="mt-1" />
          </div>
          <div>
            <Label htmlFor="photo_url">Profile Photo URL</Label>
            <Input id="photo_url" type="url" value={form.photo_url} onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))} placeholder="https://..." className="mt-1" />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <Input id="instagram" value={form.instagram} onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))} placeholder="@handle" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="tiktok">TikTok</Label>
              <Input id="tiktok" value={form.tiktok} onChange={e => setForm(f => ({ ...f, tiktok: e.target.value }))} placeholder="@handle" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input id="website" type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." className="mt-1" />
            </div>
          </div>
          <label className="flex items-start gap-3 p-4 border border-border cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={v => setAgreed(!!v)} className="mt-0.5" />
            <span className="text-sm">I am 21+, I have read and will follow the <Link to="/ambassadors/disclosure" target="_blank" className="underline">Ambassador Guidelines & FTC Disclosure</Link>, and I understand that all commission payouts are handled by impact.com.</span>
          </label>
          <Button type="submit" disabled={submitting || !agreed} size="lg" className="w-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Application"}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}