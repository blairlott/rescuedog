import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function AmbassadorDisclosurePage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto py-12 px-4">
        <h1 className="text-3xl font-bold uppercase mb-6">Ambassador Disclosure & Guidelines</h1>
        <div className="prose prose-sm max-w-none space-y-4 text-foreground">
          <p className="font-semibold">FTC Material Connection Required.</p>
          <p>
            Rescue Dog Wines Ambassadors earn a flat 12% commission on wine sales generated through their personal tracking links. Per Federal Trade Commission guidelines (16 CFR § 255), you must clearly and conspicuously disclose this relationship in every post, story, video, email, or other content where you promote our wines.
          </p>
          <h2 className="text-xl font-bold uppercase mt-8">Acceptable Disclosures</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>"#ad" or "#sponsored" at the START of a caption</li>
            <li>"I earn a commission when you order through my link"</li>
            <li>"Rescue Dog Wines Ambassador — paid partnership"</li>
          </ul>
          <h2 className="text-xl font-bold uppercase mt-8">Prohibited Claims</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>No income claims or earnings projections (e.g. "make $5,000/mo")</li>
            <li>No medical, health, or therapeutic claims about wine</li>
            <li>No promotion to anyone under 21 — your audience must be of legal drinking age</li>
            <li>No shipping to states where Vinoshipper does not deliver</li>
            <li>No use of unauthorized logos, trademarks, or copyrighted images</li>
          </ul>
          <h2 className="text-xl font-bold uppercase mt-8">Compensation</h2>
          <p>
            All commission tracking, calculation, and payouts are managed by impact.com. Tax documents (1099-NEC) are issued by impact.com directly. Rescue Dog Wines does not pay ambassadors directly and does not own a contractor relationship with you.
          </p>
          <h2 className="text-xl font-bold uppercase mt-8">Termination</h2>
          <p>
            Rescue Dog Wines may terminate any ambassador's vanity page and impact.com partnership at any time for violations of these guidelines, applicable law, or our brand standards.
          </p>
          <p className="text-xs text-muted-foreground mt-8">
            Last updated: May 2026. Questions? Contact ambassadors@rescuedogwines.com.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}