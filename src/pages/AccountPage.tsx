import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { User, Heart, Package, Gift, LogOut, Loader2, Trash2, Sparkles, Trophy, Copy, Share2, PawPrint, Wine, Link2, RefreshCw, CreditCard } from "lucide-react";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PersonalizedRecommendations } from "@/components/PersonalizedRecommendations";
import { MyRescueTab } from "@/components/account/MyRescueTab";
import { useMyMembership } from "@/hooks/useWineClub";
import { MemberDashboard } from "@/components/wine-club/MemberDashboard";
import { WineClubManagement } from "@/components/account/WineClubManagement";
import { SubscribeAndSaveTab } from "@/components/account/SubscribeAndSaveTab";
import { GiftCertificatesTab } from "@/components/account/GiftCertificatesTab";
import { PaymentMethodsTab } from "@/components/account/PaymentMethodsTab";

const AccountPage = () => {
  const { user, loading, signOut } = useCustomerAuth();
  const navigate = useNavigate();
  const { data: membership, isLoading: membershipLoading } = useMyMembership();
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

  // Referral rewards
  const { data: referralRewards = [] } = useQuery({
    queryKey: ["referral-rewards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_rewards")
        .select("*")
        .or(`referrer_id.eq.${user!.id},referred_id.eq.${user!.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const totalPoints = referralRewards
    .filter((r: any) => r.status === "approved")
    .reduce((sum: number, r: any) => {
      if (r.referrer_id === user?.id) return sum + (r.referrer_points || 0);
      if (r.referred_id === user?.id) return sum + (r.referred_points || 0);
      return sum;
    }, 0);

  const pendingReferrals = referralRewards.filter((r: any) => r.status === "pending").length;

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

          <Tabs defaultValue="for-you">
            <TabsList className="mb-6">
              <TabsTrigger value="for-you" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> For You
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-1.5">
                <User className="h-3.5 w-3.5" /> Profile
              </TabsTrigger>
              <TabsTrigger value="favorites" className="gap-1.5">
                <Heart className="h-3.5 w-3.5" /> Favorites ({favorites.length})
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="gap-1.5">
                <Package className="h-3.5 w-3.5" /> Subscriptions
              </TabsTrigger>
              <TabsTrigger value="wine-club" className="gap-1.5">
                <Wine className="h-3.5 w-3.5" /> Wine Club
              </TabsTrigger>
              <TabsTrigger value="gifts" className="gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Gifts
              </TabsTrigger>
              <TabsTrigger value="payment" className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Payment
              </TabsTrigger>
              <TabsTrigger value="referrals" className="gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Referrals
              </TabsTrigger>
              <TabsTrigger value="my-rescue" className="gap-1.5">
                <PawPrint className="h-3.5 w-3.5" /> My Rescue
              </TabsTrigger>
            </TabsList>

            {/* For You Tab */}
            <TabsContent value="for-you">
              <PersonalizedRecommendations
                favoriteHandles={favorites.map((f: any) => f.product_handle)}
                winePreferences={profile?.wine_preferences || []}
              />
            </TabsContent>

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

                <Separator className="my-2" />

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary" /> Vinoshipper Account
                  </h3>
                  {profile?.vinoshipper_customer_id ? (
                    <p className="text-xs text-muted-foreground">
                      Linked — wine shipments, age verification, and stored payment methods
                      are managed securely on Vinoshipper.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Your account is not yet linked to Vinoshipper. Wine club shipments
                        and stored payment methods require this link.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          try {
                            const { error } = await supabase.functions.invoke("vinoshipper-link-customer");
                            if (error) throw error;
                            toast.success("Linked to Vinoshipper");
                            queryClient.invalidateQueries({ queryKey: ["customer-profile"] });
                          } catch (err: any) {
                            toast.error(err.message || "Could not link Vinoshipper account");
                          }
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Link Vinoshipper Account
                      </Button>
                    </>
                  )}
                </div>
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
              <SubscribeAndSaveTab userId={user.id} vinoshipperLinked={!!profile?.vinoshipper_customer_id} />
            </TabsContent>

            {/* Wine Club Tab */}
            <TabsContent value="wine-club">
              {membershipLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : membership ? (
                <>
                  <MemberDashboard membership={membership} />
                  <WineClubManagement currentTier={(membership as any)?.tier} />
                </>
              ) : (
                <div className="text-center py-12 border border-border">
                  <Wine className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-bold text-foreground mb-2">Not a Wine Club Member Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Join one of our free clubs and enjoy 20% off all wine purchases with complimentary shipping.
                  </p>
                  <Button asChild><Link to="/club">Explore Wine Clubs</Link></Button>
                </div>
              )}
            </TabsContent>

            {/* Gifts Tab */}
            <TabsContent value="gifts">
              <GiftCertificatesTab userId={user.id} />
            </TabsContent>

            {/* Payment Tab */}
            <TabsContent value="payment">
              <PaymentMethodsTab vinoshipperLinked={!!profile?.vinoshipper_customer_id} />
            </TabsContent>

            {/* Referrals Tab */}
            <TabsContent value="referrals">
              <div className="space-y-6">
                {/* Points Balance */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-border p-5 text-center">
                    <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-3xl font-bold text-foreground">{totalPoints}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Points</p>
                  </div>
                  <div className="border border-border p-5 text-center">
                    <Gift className="w-8 h-8 text-primary mx-auto mb-2" />
                    <p className="text-3xl font-bold text-foreground">{referralRewards.filter((r: any) => r.status === "approved").length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Successful Referrals</p>
                  </div>
                  <div className="border border-border p-5 text-center">
                    <Loader2 className={`w-8 h-8 mx-auto mb-2 ${pendingReferrals > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                    <p className="text-3xl font-bold text-foreground">{pendingReferrals}</p>
                    <p className="text-xs text-muted-foreground mt-1">Pending Review</p>
                  </div>
                </div>

                {/* Share Referral */}
                <div className="border border-border p-6">
                  <h3 className="font-bold text-foreground mb-1">Refer a Friend, Earn Points</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Share your referral code or link. When your friend signs up and their referral is approved, you both earn points!
                  </p>
                  <div className="bg-muted p-4 rounded-md text-center mb-4">
                    <p className="text-xs text-muted-foreground mb-1">Your Referral Code</p>
                    <p className="text-2xl font-bold tracking-wider text-foreground">{profile?.referral_code || "Loading..."}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        navigator.clipboard.writeText(profile?.referral_code || "");
                        toast.success("Referral code copied!");
                      }}
                      disabled={!profile?.referral_code}
                    >
                      <Copy className="w-4 h-4" />Copy Code
                    </Button>
                    <Button
                      className="gap-2"
                      onClick={() => {
                        const url = `${window.location.origin}/signup?ref=${profile?.referral_code}`;
                        navigator.clipboard.writeText(url);
                        toast.success("Referral link copied!");
                      }}
                      disabled={!profile?.referral_code}
                    >
                      <Share2 className="w-4 h-4" />Copy Link
                    </Button>
                  </div>
                </div>

                {/* Referral History */}
                {referralRewards.length > 0 && (
                  <div className="border border-border">
                    <div className="px-4 py-3 border-b border-border">
                      <h3 className="font-bold text-sm text-foreground">Referral History</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {referralRewards.map((r: any) => (
                        <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {r.referrer_id === user?.id
                                ? `You referred ${r.referred_name || r.referred_email || "someone"}`
                                : `Referred by a friend`}
                            </p>
                            <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right">
                            {r.status === "approved" ? (
                              <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                +{r.referrer_id === user?.id ? r.referrer_points : r.referred_points} pts
                              </span>
                            ) : r.status === "pending" ? (
                              <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-2 py-0.5 rounded">Pending</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Rejected</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* My Rescue Tab */}
            <TabsContent value="my-rescue">
              <MyRescueTab userId={user.id} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AccountPage;
