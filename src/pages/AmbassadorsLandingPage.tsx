import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Heart, Megaphone, Sparkles, Download, ShieldCheck, ExternalLink, Check, X, Users, Building2, Wine } from "lucide-react";
import { faqPageSchema } from "@/lib/jsonLd";
import { Seo } from "@/components/Seo";

const IMPACT_SIGNUP = "https://app.impact.com/signup/none/create-new-mediapartner-account-flow.ihtml?execution=e1s1#/?viewkey=signUpPreStart";

const AMBASSADOR_FAQS = [
  {
    question: "Who can become a Rescue Dog Wines ambassador?",
    answer: "Nonprofits, rescue organizations, enthusiasts, and influencers in the U.S. who can authentically share Rescue Dog Wines with their audience. You must be 21+ and live in a state where we can ship wine.",
  },
  {
    question: "Is this a multi-level marketing (MLM) program?",
    answer: "No. This is a single-tier affiliate program. There is no recruiting, no downline, no team-building, no quotas, and no required purchases. You earn commission only on bottles sold through your own link.",
  },
  {
    question: "How much commission do ambassadors earn?",
    answer: "Ambassadors earn a flat 12% commission on every bottle sold through their unique tracking link. Commission is tracked and paid automatically through impact.com.",
  },
  {
    question: "How are commissions tracked and paid?",
    answer: "All tracking, reporting, payments, and 1099 tax forms are handled by impact.com. You'll get a unique referral link plus a dashboard to monitor clicks, conversions, and earnings.",
  },
  {
    question: "Is there a cost to join?",
    answer: "No. The ambassador program is free to join. Apply through our signup form and we'll review your application before activating your impact.com account.",
  },
  {
    question: "Can I host tasting events as an ambassador?",
    answer: "Yes. Approved ambassadors can host in-person tasting events and get a dedicated vanity page to promote them. Reach out after approval for event support.",
  },
  {
    question: "Can my 501(c)(3) rescue organization participate?",
    answer: "Yes. We have a dedicated nonprofit partner track. Apply as you would normally and note your 501(c)(3) status in your bio — our team will follow up with W-9 and bulk-payout details so commissions can flow directly to your organization.",
  },
];

export default function AmbassadorsLandingPage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Seo
        title="Rescue Ambassadors"
        description="Earn 12% commission helping dogs find their forever home. Free single-tier affiliate program for nonprofits, enthusiasts, and influencers — tracked and paid through impact.com."
        path="/ambassadors"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Ambassadors", path: "/ambassadors" },
        ]}
        jsonLd={faqPageSchema(AMBASSADOR_FAQS)}
      />
      <Header />
      <main className="flex-1">
        <section className="bg-foreground text-background py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs uppercase tracking-[0.2em] opacity-70 mb-4">Affiliate Program · 12% Commission · Powered by impact.com</p>
            <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-tight mb-6">
              Become an Online Brand Ambassador
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              Nonprofits, enthusiasts, and influencers — earn a flat <strong>12% commission</strong> on every bottle you help sell, with automatic tracking and payment through impact.com.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg" variant="secondary">
                <Link to="/ambassador/signup">Start Your Application</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent border-background text-background hover:bg-background hover:text-foreground">
                <Link to="/ambassadors/find">Find an Ambassador</Link>
              </Button>
            </div>
            <p className="text-xs opacity-60 mt-6 inline-flex items-center gap-1 justify-center">
              <ShieldCheck className="w-3 h-3" /> impact.com handles W-9, payouts &amp; 1099s — no contractor relationship with us
            </p>
          </div>
        </section>

        <section className="py-16 px-4 bg-background">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold uppercase text-center mb-3">Three Ways to Partner</h2>
            <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-12">
              Every ambassador helps grow our family-owned winery's reach — and our charitable contributions to rescue dogs.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Heart,
                  title: "Nonprofit Rescues",
                  text: "Companion-animal rescue and welfare organizations who actively promote Rescue Dog Wines and earn 12% commission on online sales — fueling your mission with every bottle.",
                },
                {
                  icon: Sparkles,
                  title: "Enthusiastic Individuals",
                  text: "You love our wines and our story. Earn a flat 12% commission for spreading the word to friends, family, and your community.",
                },
                {
                  icon: Megaphone,
                  title: "Influencers & Creators",
                  text: "Use your audience for good. Earn a flat 12% commission on every sale you generate while raising awareness for rescue dogs.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="border border-border p-6">
                  <Icon className="w-8 h-8 mb-4 text-primary" strokeWidth={1.5} />
                  <h3 className="font-bold uppercase text-sm tracking-wide mb-3">{title}</h3>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* No-MLM positioning */}
        <section className="py-16 px-4 bg-foreground text-background">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs uppercase tracking-[0.2em] opacity-70 mb-3 text-center">How we're different</p>
            <h2 className="text-3xl font-bold uppercase text-center mb-3">Affiliate, Not MLM.</h2>
            <p className="text-center opacity-80 max-w-2xl mx-auto mb-10">
              We respect your audience and your time. No recruiting, no downline, no quotas — just a fair commission on every bottle you help us sell.
            </p>
            <div className="grid md:grid-cols-2 gap-px bg-background/20 border border-background/20">
              <div className="bg-foreground p-6">
                <h3 className="font-bold uppercase text-sm tracking-wide mb-4 inline-flex items-center gap-2">
                  <Check className="w-4 h-4" /> What we do
                </h3>
                <ul className="space-y-2 text-sm opacity-90">
                  <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" />Flat 12% commission on your own sales</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" />Free to join — no kit purchase, no annual fee</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" />Tracked &amp; paid through impact.com (W-9, 1099 handled)</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" />Your own storefront page at <code className="bg-background/10 px-1">/a/your-handle</code></li>
                  <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 flex-shrink-0" />Award-winning wines from a family-owned winery</li>
                </ul>
              </div>
              <div className="bg-foreground p-6">
                <h3 className="font-bold uppercase text-sm tracking-wide mb-4 inline-flex items-center gap-2 opacity-70">
                  <X className="w-4 h-4" /> What we don't do
                </h3>
                <ul className="space-y-2 text-sm opacity-70">
                  <li className="flex gap-2"><X className="w-4 h-4 mt-0.5 flex-shrink-0" />No recruiting or downlines</li>
                  <li className="flex gap-2"><X className="w-4 h-4 mt-0.5 flex-shrink-0" />No team-building bonuses or overrides</li>
                  <li className="flex gap-2"><X className="w-4 h-4 mt-0.5 flex-shrink-0" />No monthly sales quotas to stay active</li>
                  <li className="flex gap-2"><X className="w-4 h-4 mt-0.5 flex-shrink-0" />No required auto-ship or starter purchase</li>
                  <li className="flex gap-2"><X className="w-4 h-4 mt-0.5 flex-shrink-0" />No ranks, titles, or upline pressure</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-muted">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold uppercase mb-8 text-center">How It Works</h2>
            <ol className="space-y-6">
              {[
                ["Apply on this site", "Tell us about yourself and pick a handle for your storefront page."],
                ["Sign up with impact.com", "We'll send you the link to apply with our partner network. Once approved, they handle your W-9, payouts, and 1099."],
                ["Paste your tracking link", "Add your impact.com link to your dashboard — every Shop button on your page uses it automatically."],
                ["Share & host", "Promote your link on social, host tasting events, earn commission on every order."],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="flex-shrink-0 w-10 h-10 bg-primary text-primary-foreground font-bold flex items-center justify-center">{i + 1}</span>
                  <div>
                    <h3 className="font-bold uppercase text-sm tracking-wide">{title}</h3>
                    <p className="text-sm text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="text-center mt-10">
              <Button asChild size="lg">
                <Link to="/ambassador/signup">Get Started</Link>
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Required: Read our <Link to="/ambassadors/disclosure" className="underline">FTC Disclosure</Link> before promoting our wines.
              </p>
            </div>
          </div>
        </section>

        {/* Host a tasting */}
        <section className="py-16 px-4 bg-background">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-[1fr_2fr] gap-8 items-start">
              <div>
                <Wine className="w-10 h-10 text-primary mb-4" strokeWidth={1.5} />
                <h2 className="text-3xl font-bold uppercase mb-3">Host a Tasting</h2>
                <p className="text-sm text-muted-foreground">
                  Pour with friends, share the rescue mission, and earn commission on every bottle ordered from your event link.
                </p>
              </div>
              <div className="space-y-4">
                <div className="border border-border p-5">
                  <h3 className="font-bold uppercase text-sm tracking-wide mb-2">Your event, your page</h3>
                  <p className="text-sm text-muted-foreground">Approved ambassadors create event pages at <code className="bg-muted px-1">/e/your-event</code> with RSVP tracking, date, venue, and a single "Shop the lineup" CTA tied to your impact.com link.</p>
                </div>
                <div className="border border-border p-5">
                  <h3 className="font-bold uppercase text-sm tracking-wide mb-2">Ambassador sampler bundle</h3>
                  <p className="text-sm text-muted-foreground">A curated 4-bottle sampler at an ambassador price so you can taste before you pour. <em className="not-italic text-foreground">Details and pricing coming soon — your dashboard will show the link as soon as it's live.</em></p>
                </div>
                <div className="border border-border p-5">
                  <h3 className="font-bold uppercase text-sm tracking-wide mb-2">Compliance, handled</h3>
                  <p className="text-sm text-muted-foreground">All wine ships through our licensed compliance partner. You promote — we handle age verification, taxes, and fulfillment to every state we can ship.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 501(c)(3) track */}
        <section className="py-16 px-4 bg-muted">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <Building2 className="w-10 h-10 text-primary flex-shrink-0" strokeWidth={1.5} />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">For Nonprofits</p>
                <h2 className="text-3xl font-bold uppercase mb-3">501(c)(3) Partner Track</h2>
                <p className="text-muted-foreground">
                  Companion-animal rescues and welfare nonprofits get a dedicated path — designed so commission flows to your organization, not an individual, with the paperwork your board expects.
                </p>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Users, title: "Org-level payouts", text: "Commissions paid to your organization on a quarterly bulk schedule via impact.com." },
                { icon: ShieldCheck, title: "W-9 on file", text: "We collect your W-9 once. No individual 1099s for your staff or volunteers." },
                { icon: Heart, title: "Mission-aligned", text: "Same single-tier structure — no MLM optics for your board or supporters." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="border border-border bg-background p-5">
                  <Icon className="w-6 h-6 text-primary mb-3" strokeWidth={1.5} />
                  <h3 className="font-bold uppercase text-xs tracking-wide mb-2">{title}</h3>
                  <p className="text-xs text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-6">
              <strong className="text-foreground">How to apply:</strong> use the standard ambassador application and mention your 501(c)(3) status and EIN in your bio. Our team will follow up to set up org-level payout.
            </p>
            <div className="text-center mt-6">
              <Button asChild size="lg">
                <Link to="/ambassador/signup">Apply as a Nonprofit</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-background">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold uppercase mb-6 text-center">Resources</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <a href="/docs/ambassadors/affiliate-walkthrough.pdf"
                 target="_blank" rel="noopener" className="border border-border p-5 hover:bg-muted transition flex items-start gap-3">
                <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold uppercase text-sm tracking-wide">Application Walkthrough</div>
                  <div className="text-xs text-muted-foreground mt-1">Step-by-step guide to applying through impact.com (PDF)</div>
                </div>
              </a>
              <a href="/docs/ambassadors/affiliate-tips.pdf"
                 target="_blank" rel="noopener" className="border border-border p-5 hover:bg-muted transition flex items-start gap-3">
                <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold uppercase text-sm tracking-wide">Using Your Affiliate Link</div>
                  <div className="text-xs text-muted-foreground mt-1">Tips for driving sales with your tracking link (PDF)</div>
                </div>
              </a>
            </div>
            <div className="text-center mt-8">
              <Button asChild size="lg">
                <Link to="/ambassador/signup">Start Your Application</Link>
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Already approved? <a href={IMPACT_SIGNUP} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">Sign in to the impact.com portal <ExternalLink className="w-3 h-3" /></a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}