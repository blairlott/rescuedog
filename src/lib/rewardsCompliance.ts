// Rescue Rewards compliance constants.
// Points are EARNED on all orders but REDEEMED only on merch and experiences (not wine).
// Maintained alongside legal review — update with counsel sign-off.

export const REWARDS_BLOCKED_STATES: ReadonlyArray<string> = [
  // Control / no-DTC-loyalty states
  "UT", "PA", "MS", "AL",
  // Strict tied-house / inducement / minimum-pricing states
  "TN", "TX", "NC", "KY", "MA", "CT", "NY", "MI", "IN", "MO",
];

export const REWARDS_RULES = {
  earnRate: 1, // 1 point per $1 spent (excluding shipping & tax)
  redemptionEligible: ["merch", "experience", "donation"] as const,
  redemptionExcluded: ["wine", "gift_cards", "shipping", "tax"] as const,
  pointsExpireMonths: 18,
  noCashValue: true,
};

export function isRewardsRedemptionAllowed(stateCode?: string | null): boolean {
  if (!stateCode) return true;
  return !REWARDS_BLOCKED_STATES.includes(stateCode.toUpperCase());
}