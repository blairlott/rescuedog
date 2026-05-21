import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Wine, Gift, Truck, Star, Heart, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";
import { useWineClubTiers, useMyMembership } from "@/hooks/useWineClub";
import type { WineClubTier } from "@/hooks/useWineClub";
import { VinoshipperInlineSignup } from "@/components/wine-club/VinoshipperInlineSignup";
import { MemberDashboard } from "@/components/wine-club/MemberDashboard";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { Link, useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { faqPageSchema } from "@/lib/jsonLd";


const perks = [
  { icon: Wine, title: "Curated Selections", desc: "Hand-picked wines from our award-winning portfolio, delivered to your door." },
  { icon: Gift, title: "20% Off (25% on Cases)", desc: "Members save 20% on à la carte wine — bumped to 25% on full-case orders (12+ bottles)." },
  { icon: Star, title: "Free to Join", desc: "No membership fee or upfront cost. Just sign up, pick your club, and start saving." },
  { icon: Heart, title: "Double the Impact", desc: "Your membership means even more support for rescue organizations." },
  { icon: Users, title: "Cancel Anytime", desc: "No long-term commitments. Pause or cancel your membership whenever you like." },
];

type EditSection = "hero" | "membership" | "faq" | null;

const defaultFaqs = [
  { q: "When will my shipments arrive?", a: "We time our quarterly club shipments to arrive a little before holidays like Valentine's Day, Mother's Day, the end of summer, and Thanksgiving. Our yearly shipment should arrive around Thanksgiving. We also continue to push out new club member shipments up until around December 14 for new holiday sign-ups." },
  { q: "Can I customize my shipment before it ships?", a: "Yes. About a week before each shipment is processed, we'll email you a link to customize it — swap wines, change quantities (within your tier minimum), update your delivery address, or skip the shipment. After the customization window closes, your shipment is locked in for processing." },
  { q: "Can I customize my selections?", a: "Yes. Before each release, you'll receive an email from Vinoshipper with a link to your customization page where you can swap or adjust wines before the customization deadline." },
  { q: "Can I cancel anytime?", a: "Yes! There are no long-term commitments. You can cancel your membership at any time from your account." },
  { q: "Where do you ship?", a: "We ship to most states in the US. Check availability for your state during sign-up." },
  { q: "Who picks the wines?", a: "Our team curates each release by hand, choosing wines that reflect the season and our latest releases. You can always swap selections through the Vinoshipper customization link before the deadline." },
];

const WineClubPage = () => {
  const { content, upsert } = useCmsContent("wine_club");
  const [editSection, setEditSection] = useState<EditSection>(null);
  const [editFaqIdx, setEditFaqIdx] = useState<number | null>(null);

  const { user } = useCustomerAuth();
  const navigate = useNavigate();
  const { data: tiers, isLoading: tiersLoading } = useWineClubTiers();
  const { data: membership } = useMyMembership();

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

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    hero: {
      title: "Wine Club Hero",
      fields: [
        { key: "title", label: "Title", type: "text", value: getVal("hero", "title", "Wine Club") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("hero", "subtitle", "Join one of our free wine clubs and enjoy monthly, quarterly or yearly shipments of Rescue Dog Wines at 20% off — 25% on full cases. Delivered to your doorstep or gift a membership to friends and family!") },
        { key: "image", label: "Background Image URL", type: "url", value: getVal("hero", "image", "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1920") },
      ],
    },
    membership: {
      title: "Membership Section",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("membership", "heading", "Choose Your Club") },
      { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("membership", "subtitle", "From casual sippers to dedicated collectors, there's a club for you. All clubs are free to join with 20% off every wine purchase (25% on full cases).") },
      ],
    },
  };

  // If user has an active membership, show their dashboard
  const showMemberDashboard = !!membership;

  // Derive Vinoshipper producer id from any tier's join URL so we can render
  // the full clubs embed (lists every tier) on the main page — guests pick
  // their tier once, inside Vinoshipper, instead of choosing twice.
  const vinoshipperProducerId = (() => {
    for (const t of tiers ?? []) {
      const m = t.vinoshipper_join_url?.match(
        /vinoshipper\.com\/shop\/(\d+)\/club\/(\d+)/i,
      );
      if (m) return m[1];
    }
    return null;
  })();
  const allClubsJoinUrl = vinoshipperProducerId
    ? `https://vinoshipper.com/shop/${vinoshipperProducerId}/club/0`
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Seo
        title="Wine Club"
        description="Join the Rescue Dog Wines club — free to join, 20% off (25% on full cases), cancel anytime. Every shipment supports rescue dogs."
        path="/club"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Wine Club", path: "/club" },
        ]}
        jsonLd={faqPageSchema(faqs.map((f: any) => ({ question: f.q, answer: f.a })))}
      />
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-[50vh] min-h-[400px] flex items-center bg-foreground">
          <CmsEditButton onClick={() => setEditSection("hero")} scope="wine_club" />
          <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url('${getVal("hero", "image", "https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=1920")}')` }} />
          <div className="relative container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">
              {getVal("hero", "title", "Wine Club")}
            </h1>
            <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
              {getVal("hero", "subtitle", "Join one of our free wine clubs and enjoy monthly, quarterly or yearly shipments of Rescue Dog Wines at 20% off — 25% on full cases. Delivered to your doorstep or gift a membership to friends and family!")}
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
              <CmsEditButton onClick={() => setEditSection("membership")} scope="wine_club" />
              <div className="container mx-auto px-4">
                <>
                    <div className="text-center mb-10">
                      <h2 className="text-sm font-bold tracking-brand uppercase text-muted-foreground mb-3">Design Your Own Wine Club</h2>
                      <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                        {getVal("membership", "heading", "Choose Your Club")}
                      </h3>
                      <p className="text-muted-foreground max-w-2xl mx-auto">
                        {getVal("membership", "subtitle", "From casual sippers to dedicated collectors, there's a club for you. All clubs are free to join with 20% off every wine purchase (25% on full cases).")}
                      </p>
                    </div>

                    {tiersLoading ? (
                      <div className="flex justify-center py-12">
                        <div className="border border-border p-6 animate-pulse h-40 w-full max-w-2xl bg-muted/30" />
                      </div>
                    ) : allClubsJoinUrl ? (
                      <VinoshipperInlineSignup
                        joinUrl={allClubsJoinUrl}
                        tierName="Wine Club"
                        showBack={false}
                        onBack={() => {}}
                      />
                    ) : (
                      <p className="text-center text-sm text-muted-foreground">
                        Sign-up isn't available right now — please try again shortly.
                      </p>
                    )}

                    {!user && (
                      <p className="mt-8 text-center text-xs text-muted-foreground max-w-md mx-auto">
                        Already a member?{" "}
                        <button
                          type="button"
                          onClick={() => navigate("/login?redirect=/club")}
                          className="underline hover:text-foreground"
                        >
                          Sign in
                        </button>{" "}
                        — otherwise pick a club and we'll set up your account as you join.
                      </p>
                    )}

                </>
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
                    <CmsEditButton onClick={() => setEditFaqIdx(idx)} label="Edit FAQ" scope="wine_club" />
                    <h4 className="font-bold text-foreground mb-2">{faq.q}</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    {/cancel/i.test(faq.q) && membership && membership.status !== "cancelled" && (
                      <div className="mt-3">
                        <Button asChild variant="outline" size="sm" className="gap-2">
                          <Link to="/account?tab=wine-club">
                            <XCircle className="w-4 h-4" /> Cancel Now
                          </Link>
                        </Button>
                      </div>
                    )}
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
