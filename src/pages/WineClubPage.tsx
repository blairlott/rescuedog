import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Wine, Gift, Truck, Star, Heart, Users } from "lucide-react";
import { useState } from "react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";
import { useWineClubTiers, useMyMembership, useJoinClub } from "@/hooks/useWineClub";
import type { WineClubTier, JoinClubData } from "@/hooks/useWineClub";
import { TierCard } from "@/components/wine-club/TierCard";
import { ClubSignupForm } from "@/components/wine-club/ClubSignupForm";
import { MemberDashboard } from "@/components/wine-club/MemberDashboard";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const perks = [
  { icon: Wine, title: "Curated Selections", desc: "Hand-picked wines from our award-winning portfolio, delivered to your door." },
  { icon: Gift, title: "20% Off Everything", desc: "Members enjoy 20% off all wine purchases — club shipments and à la carte orders alike." },
  { icon: Truck, title: "Shipping Included", desc: "Complimentary shipping on all club shipments, so you never pay extra." },
  { icon: Star, title: "Free to Join", desc: "No membership fee or upfront cost. Just sign up, pick your club, and start saving." },
  { icon: Heart, title: "Double the Impact", desc: "Your membership means even more support for rescue organizations." },
  { icon: Users, title: "Cancel Anytime", desc: "No long-term commitments. Pause or cancel your membership whenever you like." },
];

type EditSection = "hero" | "membership" | "faq" | null;

const defaultFaqs = [
  { q: "How often will I receive shipments?", a: "Shipment frequency depends on the club tier you choose. Most clubs ship quarterly, but some offer monthly or bi-monthly options." },
  { q: "Can I customize my selections?", a: "Yes! Before each shipment, you'll receive an email with your AI-curated selection. You can swap wines from the link in that email before the customization deadline." },
  { q: "Can I cancel anytime?", a: "Yes! There are no long-term commitments. You can cancel your membership at any time from your account." },
  { q: "Where do you ship?", a: "We ship to most states in the US. Check availability for your state during sign-up." },
  { q: "How does AI curation work?", a: "Our AI learns your preferences over time and suggests wines you'll love. Every selection is reviewed by our team before shipping." },
];

const frequencyFilters = [
  { value: "all", label: "All" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "bi-annual", label: "Bi-Annual" },
  { value: "yearly", label: "Yearly" },
];

const WineClubPage = () => {
  const { content, upsert } = useCmsContent("wine_club");
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editFaqIdx, setEditFaqIdx] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<WineClubTier | null>(null);
  const [frequencyFilter, setFrequencyFilter] = useState("all");

  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const { data: tiers, isLoading: tiersLoading } = useWineClubTiers();
  const { data: membership, isLoading: memberLoading } = useMyMembership();
  const joinClub = useJoinClub();

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);
  const faqs = content.faqs?.items || defaultFaqs;

  const handleSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, {
      onSuccess: () => setEditSection(null),
    });
  };

  const handleFaqSave = (idx: number) => (values: Record<string, string>) => {
    const updated = [...faqs];
    updated[idx] = { q: values.q, a: values.a };
    upsert.mutate({ sectionKey: "faqs", content: { items: updated } }, {
      onSuccess: () => setEditFaqIdx(null),
    });
  };

  const handleSelectTier = (tier: WineClubTier) => {
    if (!user) {
      navigate("/login?redirect=/club");
      return;
    }
    setSelectedTier(tier);
  };

  const handleJoin = (data: JoinClubData) => {
    joinClub.mutate(data, {
      onSuccess: () => setSelectedTier(null),
    });
  };

  const filteredTiers = tiers?.filter(
    (t) => frequencyFilter === "all" || t.frequency === frequencyFilter
  );

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    hero: {
      title: "Wine Club Hero",
      fields: [
        { key: "title", label: "Title", type: "text", value: getVal("hero", "title", "Wine Club") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("hero", "subtitle", "Join one of our free wine clubs and enjoy monthly, quarterly or yearly shipments of Rescue Dog Wines at 20% off with shipping included — delivered to your doorstep or gift a membership to friends and family!") },
        { key: "image", label: "Background Image URL", type: "url", value: getVal("hero", "image", "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1920") },
      ],
    },
    membership: {
      title: "Membership Section",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("membership", "heading", "Choose Your Club") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("membership", "subtitle", "From casual sippers to dedicated collectors, there's a club for you. All clubs are free to join with 20% off every wine purchase and free shipping on shipments.") },
      ],
    },
  };

  // If user has an active membership, show their dashboard
  const showMemberDashboard = membership && !selectedTier;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <CmsEditButton onClick={() => setEditSection("hero")} />
          <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url('${getVal("hero", "image", "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1920")}')` }} />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">
              {getVal("hero", "title", "Wine Club")}
            </h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              {getVal("hero", "subtitle", "Join one of our free wine clubs and enjoy monthly, quarterly or yearly shipments of Rescue Dog Wines at 20% off with shipping included — delivered to your doorstep or gift a membership to friends and family!")}
            </p>
          </div>
        </section>

        {/* Member Dashboard or Perks */}
        {showMemberDashboard ? (
          <section className="py-16 md:py-20">
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Your Membership</h2>
                <h3 className="text-3xl md:text-4xl font-bold text-foreground">Welcome Back, Member! 🍷</h3>
              </div>
              <MemberDashboard membership={membership} />
            </div>
          </section>
        ) : (
          <>
            {/* Perks */}
            <section className="py-16 md:py-20">
              <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                  <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Member Benefits</h2>
                  <h3 className="text-3xl md:text-4xl font-bold text-foreground">Why Join Our Wine Club?</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {perks.map((perk) => (
                    <div key={perk.title} className="text-center p-6 border border-border">
                      <perk.icon className="h-10 w-10 text-primary mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-foreground mb-2">{perk.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{perk.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Tier Selection or Signup Form */}
            <section className="py-16 bg-secondary relative" id="tiers">
              <CmsEditButton onClick={() => setEditSection("membership")} />
              <div className="container mx-auto px-4">
                {selectedTier ? (
                  <ClubSignupForm
                    tier={selectedTier}
                    onBack={() => setSelectedTier(null)}
                    onSubmit={handleJoin}
                    isSubmitting={joinClub.isPending}
                  />
                ) : (
                  <>
                    <div className="text-center mb-10">
                      <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Choose Your Club</h2>
                      <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                        {getVal("membership", "heading", "Choose Your Club")}
                      </h3>
                      <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                        {getVal("membership", "subtitle", "From casual sippers to dedicated collectors, there's a club for you. All selections are AI-curated and customizable before each shipment.")}
                      </p>

                      {/* Frequency Filter */}
                      <Tabs value={frequencyFilter} onValueChange={setFrequencyFilter} className="mb-8">
                        <TabsList>
                          {frequencyFilters.map((f) => (
                            <TabsTrigger key={f.value} value={f.value}>
                              {f.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>

                    {tiersLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="border border-border p-6 animate-pulse h-80 bg-muted/30" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredTiers?.map((tier) => (
                          <TierCard key={tier.id} tier={tier} onSelect={handleSelectTier} />
                        ))}
                      </div>
                    )}

                    {!user && (
                      <p className="text-center text-sm text-muted-foreground mt-6">
                        <Button variant="link" className="p-0 text-primary" onClick={() => navigate("/login?redirect=/club")}>
                          Sign in
                        </Button>{" "}
                        or{" "}
                        <Button variant="link" className="p-0 text-primary" onClick={() => navigate("/signup?redirect=/club")}>
                          create an account
                        </Button>{" "}
                        to join a club.
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {/* FAQ */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-foreground mb-8 text-center">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {faqs.map((faq: any, idx: number) => (
                  <div key={`faq-${idx}`} className="border-b border-border pb-6 relative">
                    <CmsEditButton onClick={() => setEditFaqIdx(idx)} label="Edit FAQ" />
                    <h4 className="font-bold text-foreground mb-2">{faq.q}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />

      {/* CMS Edit Dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => { if (!open) setEditSection(null); }}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}
      {editFaqIdx !== null && (
        <CmsEditDialog
          open={editFaqIdx !== null}
          onOpenChange={(open) => { if (!open) setEditFaqIdx(null); }}
          title={`Edit FAQ #${editFaqIdx + 1}`}
          fields={[
            { key: "q", label: "Question", type: "text", value: faqs[editFaqIdx]?.q || "" },
            { key: "a", label: "Answer", type: "textarea", value: faqs[editFaqIdx]?.a || "" },
          ]}
          onSave={handleFaqSave(editFaqIdx)}
          isSaving={upsert.isPending}
        />
      )}
    </div>
  );
};

export default WineClubPage;
