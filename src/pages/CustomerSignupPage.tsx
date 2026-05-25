import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail } from "lucide-react";
import { useLaunchFeatures } from "@/hooks/useLaunchFeatures";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useEffect } from "react";
import { isStaffEmail, STAFF_EMAIL_MESSAGE } from "@/lib/staffEmail";

const CustomerSignupPage = () => {
  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam : "/account";
  const nextQs = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";
  const { referralsEnabled } = useLaunchFeatures();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    referralCode: "",
  });
  const [ageConfirm, setAgeConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  // Pre-fill referral code from URL param (e.g. /signup?ref=abc123)
  useEffect(() => {
    if (!referralsEnabled) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setFormData(d => ({ ...d, referralCode: ref }));
  }, [referralsEnabled]);

  useEffect(() => {
    if (user) navigate(nextPath);
  }, [user, navigate, nextPath]);

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffEmail(formData.email)) {
      toast.error(STAFF_EMAIL_MESSAGE);
      return;
    }
    if (!ageConfirm) {
      toast.error("You must confirm you are 21+ to create an account");
      return;
    }
    setIsLoading(true);
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: `${formData.firstName} ${formData.lastName}`,
            referred_by: formData.referralCode || undefined,
          },
          emailRedirectTo: `${window.location.origin}${nextPath}`,
        },
      });
      if (error) throw error;

      // If a referral code was provided, create the referral tracking record
      if (referralsEnabled && formData.referralCode && signUpData.user) {
        // Look up the referrer by their referral_code
        const { data: referrer } = await supabase
          .from("customer_profiles")
          .select("id")
          .eq("referral_code", formData.referralCode)
          .maybeSingle();

        if (referrer) {
          // Create customer profile with referred_by
          await supabase.from("customer_profiles").upsert({
            id: signUpData.user.id,
            email: formData.email,
            display_name: `${formData.firstName} ${formData.lastName}`,
            referred_by: formData.referralCode,
            updated_at: new Date().toISOString(),
          } as any);

          // Create pending referral reward
          await supabase.from("referral_rewards").insert({
            referrer_id: referrer.id,
            referred_id: signUpData.user.id,
            referred_email: formData.email,
            referred_name: `${formData.firstName} ${formData.lastName}`,
            status: "pending",
          } as any);
        }
      }
      toast.success("Check your email to verify your account!");
      navigate(`/login${nextQs}`);
    } catch (err: any) {
      toast.error(err.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!ageConfirm) {
      toast.error("You must confirm you are 21+ to create an account");
      return;
    }
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}${nextPath}`,
      });
      if (result.error) throw result.error;
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
      setIsGoogleLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    if (!ageConfirm) {
      toast.error("You must confirm you are 21+ to create an account");
      return;
    }
    setIsAppleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: `${window.location.origin}${nextPath}`,
      });
      if (result.error) throw result.error;
    } catch (err: any) {
      toast.error(err.message || "Apple sign-in failed");
      setIsAppleLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
            <p className="text-muted-foreground mt-2">Join us for personalized recommendations, saved favorites, and exclusive perks</p>
          </div>

          {/* Age verification */}
          <label className="flex items-start gap-3 p-4 border border-border rounded-md cursor-pointer">
            <Checkbox checked={ageConfirm} onCheckedChange={(v) => setAgeConfirm(!!v)} className="mt-0.5" />
            <span className="text-sm text-foreground">I confirm I am <strong>21 years of age or older</strong></span>
          </label>

          {/* Social Signup */}
          <div className="space-y-3">
            <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={handleGoogleLogin} disabled={isGoogleLoading}>
              {isGoogleLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </Button>
            <Button variant="outline" className="w-full h-12 text-sm font-medium" onClick={handleAppleLogin} disabled={isAppleLoading}>
              {isAppleLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              )}
              Continue with Apple
            </Button>
          </div>

          <div className="relative">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground uppercase">or</span>
          </div>

          {/* Email Signup */}
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" required value={formData.firstName} onChange={e => setFormData(d => ({ ...d, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" required value={formData.lastName} onChange={e => setFormData(d => ({ ...d, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={formData.email} onChange={e => setFormData(d => ({ ...d, email: e.target.value }))} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={formData.password} onChange={e => setFormData(d => ({ ...d, password: e.target.value }))} placeholder="Min. 6 characters" />
            </div>
            {referralsEnabled && (
              <div className="space-y-1.5">
                <Label htmlFor="referralCode">Referral Code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="referralCode" value={formData.referralCode} onChange={e => setFormData(d => ({ ...d, referralCode: e.target.value.trim() }))} placeholder="e.g. a1b2c3d4" />
              </div>
            )}
            <Button type="submit" className="w-full h-12" disabled={isLoading || !ageConfirm}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-2" />Create Account</>}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to={`/login${nextQs}`} className="text-primary font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CustomerSignupPage;
