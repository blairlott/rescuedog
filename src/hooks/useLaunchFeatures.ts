import { useIsFeatureEnabled } from "@/hooks/useDevToggles";

/**
 * Pre-launch feature gate for Rewards + Referrals.
 * Both default OFF in the `dev_toggles` table. Re-enable post-launch via
 * CMS Settings → Dev Controls once program mechanics + compliance copy +
 * fulfillment are signed off.
 */
export function useLaunchFeatures() {
  const rewards = useIsFeatureEnabled("account_features", "rewards_program");
  const referrals = useIsFeatureEnabled("account_features", "referral_program");
  return {
    rewardsEnabled: rewards.enabled,
    referralsEnabled: referrals.enabled,
    isLoading: rewards.isLoading || referrals.isLoading,
  };
}