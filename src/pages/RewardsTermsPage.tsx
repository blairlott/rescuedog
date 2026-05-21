import { Link, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { REWARDS_BLOCKED_STATES, REWARDS_RULES } from "@/lib/rewardsCompliance";
import { useLaunchFeatures } from "@/hooks/useLaunchFeatures";

export default function RewardsTermsPage() {
  const { rewardsEnabled, isLoading } = useLaunchFeatures();
  if (isLoading) return null;
  if (!rewardsEnabled) return <Navigate to="/account" replace />;
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-brand text-muted-foreground">Program Terms</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold uppercase tracking-brand">
            Rescue Rewards — Terms &amp; Conditions
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </header>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">How you earn</h2>
          <p>
            Members earn <strong>{REWARDS_RULES.earnRate} point per $1 spent</strong> on qualifying
            orders placed through Rescue Dog Wines. Shipping charges, taxes, gift-card purchases, and
            previously refunded amounts do not earn points.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">How you redeem</h2>
          <p>
            Points may be redeemed for <strong>merchandise</strong> (apparel, accessories, drinkware),
            <strong> tasting events &amp; ambassador experiences</strong>, or <strong>donations</strong>{" "}
            to a participating rescue partner.
          </p>
          <p className="border border-border bg-muted/30 p-3">
            <strong>Points are NOT redeemable on wine</strong>, sparkling, or any alcoholic beverage,
            and cannot be applied toward shipping or taxes on alcohol orders. This restriction exists
            to comply with state alcohol regulations.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">Expiration</h2>
          <p>
            Points expire <strong>{REWARDS_RULES.pointsExpireMonths} months</strong> after the date
            they are earned if the account remains inactive (no qualifying purchase) during that period.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">No cash value</h2>
          <p>
            Points have no cash value, are non-transferable, cannot be sold or assigned, and may not be
            combined across accounts. Points are not refundable upon order cancellation; redeemed points
            for returned items will be reissued at our discretion.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">Eligibility &amp; state restrictions</h2>
          <p>
            The program is open to U.S. residents 21+ with a valid Rescue Dog Wines account. Redemption
            and program participation may be limited or unavailable where prohibited by state law.
            Currently restricted states for redemption include:
          </p>
          <p className="font-mono text-xs border border-border p-3 bg-muted/30">
            {REWARDS_BLOCKED_STATES.join(", ")}
          </p>
          <p className="text-xs text-muted-foreground">
            Program void where prohibited. We may add or remove states at any time without notice.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">Modification &amp; termination</h2>
          <p>
            Rescue Dog Wines reserves the right to modify, suspend, or terminate the Rescue Rewards
            program (including earn rates, redemption options, expiration policies, and these terms) at
            any time. We will provide reasonable notice of material changes via email or on this page.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-bold uppercase tracking-brand">Fraud &amp; abuse</h2>
          <p>
            We may suspend or terminate accounts and void points associated with fraudulent activity,
            chargebacks, or abuse of the program. All decisions are final.
          </p>
        </section>

        <p className="text-xs text-muted-foreground border-t border-border pt-4">
          Questions? <Link to="/contact" className="underline">Contact us</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}