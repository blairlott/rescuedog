import { Link, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RescueRewardsDashboard } from "@/components/account/RescueRewardsDashboard";
import { useLaunchFeatures } from "@/hooks/useLaunchFeatures";

export default function RewardsPage() {
  const { rewardsEnabled, isLoading } = useLaunchFeatures();
  if (isLoading) return null;
  if (!rewardsEnabled) return <Navigate to="/account" replace />;
  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-brand text-muted-foreground">Rescue Rewards</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold uppercase tracking-brand">
            Earn points. Help dogs.
          </h1>
          <p className="text-sm text-muted-foreground max-w-prose">
            Earn 1 point per $1 on every order. Redeem for merch, tasting events, ambassador
            experiences, or donate points directly to a rescue partner.
          </p>
          <p className="text-xs">
            <Link to="/rewards/terms" className="underline text-muted-foreground">Program terms &amp; state restrictions</Link>
          </p>
        </header>
        <RescueRewardsDashboard />
      </main>
      <Footer />
    </>
  );
}