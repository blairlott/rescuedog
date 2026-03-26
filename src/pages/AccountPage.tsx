import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { User, Heart, Package, Gift, LogOut, Loader2, Trash2, Sparkles } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const AccountPage = () => {
  const { user, loading, signOut } = useCustomerAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [loading, user, navigate]);

  // Profile data
  const { data: profile } = useQuery({
    queryKey: ["customer-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Favorites
  const { data: favorites = [] } = useQuery({
    queryKey: ["customer-favorites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_favorites")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Subscriptions
  const { data: subscriptions = [] } = useQuery({
    queryKey: ["customer-subscriptions", user?.email],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_signups")
        .select("*")
        .eq("email", user!.email!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user?.email,
  });

  // Remove favorite
  const removeFav = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_favorites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-favorites"] });
      toast.success("Removed from favorites");
    },
  });

  // Profile form
  const [profileForm, setProfileForm] = useState({ display_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        display_name: profile.display_name || user?.user_metadata?.full_name || "",
        phone: profile.phone || "",
      });
    } else if (user) {
      setProfileForm({
        display_name: user.user_metadata?.full_name || "",
        phone: "",
      });
    }
  }, [profile, user]);

  const handleProfileSave = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase.from("customer_profiles").upsert({
        id: user.id,
        display_name: profileForm.display_name,
        phone: profileForm.phone,
        email: user.email,
        updated_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
      toast.success("Profile updated!");
      queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Account Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">My Account</h1>
              <p className="text-muted-foreground">{user.email}</p>
              {profile?.referral_code && (
                <p className="text-xs text-muted-foreground mt-1">
                  Your referral code: <strong className="text-foreground">{profile.referral_code}</strong>
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />Sign Out
            </Button>
          </div>

          <Tabs defaultValue="profile">
            <TabsList className="mb-6">
              <TabsTrigger value="profile" className="gap-1.5">
                <User className="h-3.5 w-3.5" /> Profile
              </TabsTrigger>
              <TabsTrigger value="favorites" className="gap-1.5">
                <Heart className="h-3.5 w-3.5" /> Favorites ({favorites.length})
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="gap-1.5">
                <Package className="h-3.5 w-3.5" /> Subscriptions
              </TabsTrigger>
              <TabsTrigger value="referrals" className="gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Referrals
              </TabsTrigger>
            </TabsList>

            {/* Profile Tab */}
            <TabsContent value="profile">
              <div className="bg-background border border-border p-6 space-y-4 max-w-md">
                <h2 className="font-bold text-foreground">Personal Information</h2>
                <div className="space-y-1.5">
                  <Label>Display Name</Label>
                  <Input value={profileForm.display_name} onChange={e => setProfileForm(f => ({ ...f, display_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={user.email || ""} disabled className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
                <Button onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            {/* Favorites Tab */}
            <TabsContent value="favorites">
              {favorites.length === 0 ? (
                <div className="text-center py-12 border border-border">
                  <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-bold text-foreground mb-2">No favorites yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Browse our wines and click the heart to save your favorites</p>
                  <Button asChild><Link to="/wines">Browse Wines</Link></Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {favorites.map((fav: any) => (
                    <div key={fav.id} className="border border-border p-4 flex gap-4">
                      <div className="w-16 h-20 bg-secondary rounded overflow-hidden flex-shrink-0">
                        {fav.product_image_url && <img src={fav.product_image_url} alt={fav.product_title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link to={`/product/${fav.product_handle}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">
                          {fav.product_title}
                        </Link>
                        {fav.product_price && <p className="text-sm text-muted-foreground">${fav.product_price}</p>}
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive mt-1 px-0" onClick={() => removeFav.mutate(fav.id)}>
                          <Trash2 className="w-3 h-3 mr-1" />Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Subscriptions Tab */}
            <TabsContent value="subscriptions">
              {subscriptions.length === 0 ? (
                <div className="text-center py-12 border border-border">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-bold text-foreground mb-2">No subscriptions</h3>
                  <p className="text-sm text-muted-foreground mb-4">Start a wine subscription and save on every shipment</p>
                  <Button asChild><Link to="/subscribe">Browse Subscriptions</Link></Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {subscriptions.map((sub: any) => (
                    <div key={sub.id} className="border border-border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-foreground capitalize">{sub.tier || sub.subscription_type} Plan</h3>
                        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-sm ${
                          sub.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' : 'bg-muted text-muted-foreground'
                        }`}>{sub.status}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Frequency: {sub.frequency}</p>
                      {sub.wine_preferences?.length > 0 && (
                        <p className="text-sm text-muted-foreground">Preferences: {sub.wine_preferences.join(", ")}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">Created {new Date(sub.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Referrals Tab */}
            <TabsContent value="referrals">
              <div className="border border-border p-6 max-w-md">
                <Gift className="w-10 h-10 text-primary mb-4" />
                <h2 className="text-xl font-bold text-foreground mb-2">Refer a Friend</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Share your unique referral code with friends. When they make their first purchase, you both save!
                </p>
                <div className="bg-muted p-4 rounded-md text-center mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Your Referral Code</p>
                  <p className="text-2xl font-bold tracking-wider text-foreground">{profile?.referral_code || "Loading..."}</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(profile?.referral_code || "");
                    toast.success("Referral code copied!");
                  }}
                  disabled={!profile?.referral_code}
                >
                  Copy Referral Code
                </Button>
                <p className="text-[10px] text-muted-foreground text-center mt-3">
                  Share via text, email, or social media. Referral rewards applied automatically.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AccountPage;
