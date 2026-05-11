import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Heart, Users, Calendar, DollarSign } from "lucide-react";

export default function AmbassadorsLandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="bg-foreground text-background py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-tight mb-6">
              Become a Rescue Ambassador
            </h1>
            <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              Share wines you love, host tasting events, and earn commission on every bottle sold through your link — while helping rescue dogs find homes.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg" variant="secondary">
                <Link to="/ambassador/signup">Apply to Join</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="bg-transparent border-background text-background hover:bg-background hover:text-foreground">
                <Link to="/ambassadors/find">Find an Ambassador</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 bg-background">
          <div className="max-w-5xl mx-auto grid md:grid-cols-4 gap-8">
            {[
              { icon: DollarSign, title: "Earn Commission", text: "Get paid on every bottle sold through your tracking link via impact.com." },
              { icon: Calendar, title: "Host Tastings", text: "Run virtual or in-person tasting events. We track RSVPs and attendance for you." },
              { icon: Heart, title: "Support Rescues", text: "Pick a partner rescue — every order routes a donation their way." },
              { icon: Users, title: "Build Community", text: "Get a custom storefront page and grow your following." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="text-center">
                <Icon className="w-10 h-10 mx-auto mb-3 text-primary" strokeWidth={1.5} />
                <h3 className="font-bold uppercase text-sm tracking-wide mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
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
      </main>
      <Footer />
    </div>
  );
}