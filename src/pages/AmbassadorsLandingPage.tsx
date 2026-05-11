import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Heart, Megaphone, Sparkles, Download, ShieldCheck, ExternalLink } from "lucide-react";

const IMPACT_SIGNUP = "https://app.impact.com/signup/none/create-new-mediapartner-account-flow.ihtml?execution=e1s1#/?viewkey=signUpPreStart";

export default function AmbassadorsLandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="bg-foreground text-background py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-xs uppercase tracking-[0.2em] opacity-70 mb-4">Affiliate Program · Powered by impact.com</p>
            <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-tight mb-6">
              Become an Online Brand Ambassador
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              Nonprofits, enthusiasts, and influencers — earn percentage-based commission on every bottle you help sell, with automatic tracking and payment through impact.com.
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
                  text: "Companion-animal rescue and welfare organizations who actively promote Rescue Dog Wines and earn percentage-based commission on online sales — fueling your mission with every bottle.",
                },
                {
                  icon: Sparkles,
                  title: "Enthusiastic Individuals",
                  text: "You love our wines and our story. Get rewarded with commissions for spreading the word to friends, family, and your community.",
                },
                {
                  icon: Megaphone,
                  title: "Influencers & Creators",
                  text: "Use your audience for good. Earn percentage-based commission on every sale you generate while raising awareness for rescue dogs.",
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

        <section className="py-16 px-4 bg-background">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold uppercase mb-6 text-center">Resources</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <a href="https://rescuedogwines.com/wp-content/uploads/2024/04/RDW_Affiliate-Program-Application-Walkthrough_2024-04.pdf"
                 target="_blank" rel="noopener" className="border border-border p-5 hover:bg-muted transition flex items-start gap-3">
                <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold uppercase text-sm tracking-wide">Application Walkthrough</div>
                  <div className="text-xs text-muted-foreground mt-1">Step-by-step guide to applying through impact.com (PDF)</div>
                </div>
              </a>
              <a href="https://rescuedogwines.com/wp-content/uploads/2024/04/RDW_Affiliate-Program-Tips_2024-01.pdf"
                 target="_blank" rel="noopener" className="border border-border p-5 hover:bg-muted transition flex items-start gap-3">
                <Download className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold uppercase text-sm tracking-wide">Using Your Affiliate Link</div>
                  <div className="text-xs text-muted-foreground mt-1">Tips for driving sales with your tracking link (PDF)</div>
                </div>
              </a>
            </div>
            <div className="text-center mt-8">
              <a href={IMPACT_SIGNUP} target="_blank" rel="noopener noreferrer" className="text-sm underline inline-flex items-center gap-1">
                Apply directly through the impact.com portal <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}