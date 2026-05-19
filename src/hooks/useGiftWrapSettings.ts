import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";

export interface GiftWrapSettings {
  enabled: boolean;
  feeCents: number;
  isLoading: boolean;
}

const DEFAULTS = {
  enabled: false,
  feeCents: 400,
};

export function useGiftWrapSettings(): GiftWrapSettings {
  const { content, isLoading } = useCmsContent("cart_settings");
  const enabledRaw = getCmsValue(content, "gift_wrap", "enabled", String(DEFAULTS.enabled));
  const feeRaw = getCmsValue(content, "gift_wrap", "fee_cents", String(DEFAULTS.feeCents));
  return {
    enabled: enabledRaw === "true" || enabledRaw === true as any,
    feeCents: Number(feeRaw) || DEFAULTS.feeCents,
    isLoading,
  };
}

export const GIFT_WRAP_DEFAULTS = DEFAULTS;
