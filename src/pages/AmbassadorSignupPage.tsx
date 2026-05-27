import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { toast } from "sonner";
import { AvatarUploader } from "@/components/ambassador/AvatarUploader";
import { Seo } from "@/components/Seo";

export default function AmbassadorSignupPage() {
  const { user, loading } = useCustomerAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [form, setForm] = useState({
    handle: "",
    display_name: "",
    bio: "",
    photo_url: "",
    instagram: "",
    tiktok: "",
    website: "",
  });

  const cleanHandle = useMemo(
    () => form.handle.toLowerCase().replace(/[^a-z0-9-]/g, ""),
    [form.handle]
  );

  useEffect(() => {
    if (!cleanHandle) { setHandleStatus("idle"); return; }
    if (cleanHandle.length < 3) { setHandleStatus("invalid"); return; }
    setHandleStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("ambassador_profiles")
        .select("id")
        .eq("handle", cleanHandle)
        .maybeSingle();
      setHandleStatus(data ? "taken" : "available");
    }, 400);
    return () => clearTimeout(t);
  }, [cleanHandle]);

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
      <div className="min-h-dvh flex flex-col">
        <Header />
        <main className="flex-1 max-w-md mx-auto py-16 px-4 text-center">
          <h1 className="text-2xl font-bold uppercase mb-4">Sign In to Apply</h1>
          <p className="text-muted-foreground mb-6">
            You need an account to become a Rescue Ambassador. Accounts are created when you place
            your first wine order — sign in if you already have one.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild><Link to={`/login?next=/ambassador/signup`}>Sign In</Link></Button>
            <Button asChild variant="outline"><Link to="/shop">Shop Wine</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) { toast.error("You must agree to the Ambassador Guidelines"); return; }
    if (cleanHandle.length < 3) { toast.error("Handle must be at least 3 characters (letters, numbers, hyphens)"); return; }
    if (handleStatus === "taken") { toast.error("That handle is taken — try another"); return; }
    setSubmitting(true);
    const profileId = crypto.randomUUID();
    const { error } = await supabase.from("ambassador_profiles").insert({
      id: profileId,
      user_id: user.id,
      handle: cleanHandle,
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
    // Fire-and-forget welcome email with impact.com next-step CTA
    supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "ambassador-welcome",
        recipientEmail: user.email,
        idempotencyKey: `ambassador-welcome-${profileId}`,
        templateData: {
          name: form.display_name,
          handle: cleanHandle,
          dashboardUrl: `${window.location.origin}/ambassador/dashboard`,
        },
      },
    }).catch((err) => console.warn("welcome email failed", err));
    toast.success("Application submitted! Check your email for next steps.");
    navigate("/ambassador/dashboard?welcome=1");
  };

  if (hasProfile) return null;

  return (
    <>
      <Seo noindex title="Ambassador Signup" />
    <div className="min-h-dvh flex flex-col">
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
            <div className="text-xs mt-1 flex items-center gap-2 min-h-[1.25rem]">
              {handleStatus === "idle" && (
                <span className="text-muted-foreground">Lowercase letters, numbers, hyphens. 3+ characters.</span>
              )}
              {handleStatus === "invalid" && (
                <span className="text-muted-foreground">Keep typing — at least 3 characters.</span>
              )}
              {handleStatus === "checking" && cleanHandle && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking <code className="bg-muted px-1">/a/{cleanHandle}</code>…
                </span>
              )}
              {handleStatus === "available" && (
                <span className="text-green-700 inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> <code className="bg-muted px-1">/a/{cleanHandle}</code> is available
                </span>
              )}
              {handleStatus === "taken" && (
                <span className="text-destructive inline-flex items-center gap-1">
                  <X className="w-3 h-3" /> <code className="bg-muted px-1">/a/{cleanHandle}</code> is taken
                </span>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="display_name">Display Name *</Label>
            <Input id="display_name" required value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Jane Doe" className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="bio">Bio</Label>
              <span className="text-xs text-muted-foreground">{form.bio.length}/500</span>
            </div>
            <Textarea id="bio" rows={4} maxLength={500} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="Tell visitors about yourself, why you love rescue dogs, and what wines you recommend." className="mt-1" />
          </div>
          <div>
            <Label>Profile Photo</Label>
            <div className="mt-2">
              <AvatarUploader
                userId={user.id}
                value={form.photo_url || null}
                onChange={(url) => setForm(f => ({ ...f, photo_url: url || "" }))}
              />
            </div>
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
          <Button type="submit" disabled={submitting || !agreed || handleStatus === "taken" || handleStatus === "invalid" || handleStatus === "checking"} size="lg" className="w-full">
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
              </span>
            ) : "Submit Application"}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
    </>
  );
}