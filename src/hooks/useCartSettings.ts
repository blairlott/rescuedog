import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";

export interface CartSettings {
  freeShippingBottleCount: number;
  merchFreeShippingThreshold: number;
  halfCaseCount: number;
  fullCaseCount: number;
  fullCaseDiscount: number;
  clubDiscount: number;
  /**
   * Vinoshipper promo code that grants the public case discount
   * (e.g. "CASE10"). Must be configured in Vinoshipper Producer →
   * Marketing → Discount Codes with a matching min-bottle rule.
   * Vinoshipper validates and applies it at checkout — our cart only
   * surfaces / auto-applies it.
   */
  caseDiscountCode: string;
  /**
   * Vinoshipper Customer Group ID used for the Wine Club member
   * discount. Members get auto-discounted by VS at checkout, so no
   * code is needed for them — this is here for reference / for the
   * membership edge function to assign customers to the group.
   */
  memberGroupId: string;
}

const DEFAULTS: CartSettings = {
  freeShippingBottleCount: 12,
  merchFreeShippingThreshold: 150,
  halfCaseCount: 6,
  fullCaseCount: 12,
  fullCaseDiscount: 10,
  clubDiscount: 20,
  caseDiscountCode: "",
  memberGroupId: "",
};

export function useCartSettings(): CartSettings & { isLoading: boolean } {
  const { content, isLoading } = useCmsContent("cart_settings");

  return {
    freeShippingBottleCount: Number(getCmsValue(content, "thresholds", "free_shipping_bottles", String(DEFAULTS.freeShippingBottleCount))),
    merchFreeShippingThreshold: Number(getCmsValue(content, "thresholds", "merch_free_shipping_dollars", String(DEFAULTS.merchFreeShippingThreshold))),
    halfCaseCount: Number(getCmsValue(content, "thresholds", "half_case_count", String(DEFAULTS.halfCaseCount))),
    fullCaseCount: Number(getCmsValue(content, "thresholds", "full_case_count", String(DEFAULTS.fullCaseCount))),
    fullCaseDiscount: Number(getCmsValue(content, "thresholds", "full_case_discount", String(DEFAULTS.fullCaseDiscount))),
    clubDiscount: Number(getCmsValue(content, "thresholds", "club_discount", String(DEFAULTS.clubDiscount))),
    caseDiscountCode: String(getCmsValue(content, "vinoshipper", "case_discount_code", DEFAULTS.caseDiscountCode)).trim(),
    memberGroupId: String(getCmsValue(content, "vinoshipper", "member_group_id", DEFAULTS.memberGroupId)).trim(),
    isLoading,
  };
}

export { DEFAULTS as CART_DEFAULTS };
