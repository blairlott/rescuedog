import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";

export interface CartSettings {
  freeShippingBottleCount: number;
  halfCaseCount: number;
  fullCaseCount: number;
  fullCaseDiscount: number;
  clubDiscount: number;
}

const DEFAULTS: CartSettings = {
  freeShippingBottleCount: 6,
  halfCaseCount: 6,
  fullCaseCount: 12,
  fullCaseDiscount: 10,
  clubDiscount: 20,
};

export function useCartSettings(): CartSettings & { isLoading: boolean } {
  const { content, isLoading } = useCmsContent("cart_settings");

  return {
    freeShippingBottleCount: Number(getCmsValue(content, "thresholds", "free_shipping_bottles", String(DEFAULTS.freeShippingBottleCount))),
    halfCaseCount: Number(getCmsValue(content, "thresholds", "half_case_count", String(DEFAULTS.halfCaseCount))),
    fullCaseCount: Number(getCmsValue(content, "thresholds", "full_case_count", String(DEFAULTS.fullCaseCount))),
    fullCaseDiscount: Number(getCmsValue(content, "thresholds", "full_case_discount", String(DEFAULTS.fullCaseDiscount))),
    clubDiscount: Number(getCmsValue(content, "thresholds", "club_discount", String(DEFAULTS.clubDiscount))),
    isLoading,
  };
}

export { DEFAULTS as CART_DEFAULTS };
