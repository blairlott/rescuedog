/**
 * Plain-language field definitions for every personalization slot.
 * Used by the Experiments + Rules forms so non-technical users never
 * have to touch raw JSON. Keep keys in sync with useExperiment() callers.
 */

export type SlotField =
  | { key: string; label: string; help?: string; type: "text" | "url" | "image" | "longtext" }
  | { key: string; label: string; help?: string; type: "bool" }
  | { key: string; label: string; help?: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; help?: string; type: "multi"; options: { value: string; label: string }[] };

export type SlotSchema = {
  key: string;
  label: string;
  description: string;
  fields: SlotField[];
};

export const SLOT_SCHEMAS: SlotSchema[] = [
  {
    key: "homepage_hero",
    label: "Homepage Hero",
    description: "The big banner at the top of the homepage.",
    fields: [
      { key: "imageUrl", label: "Background image", type: "image", help: "Paste an image URL or pick from your Media library." },
      { key: "headlineOverride", label: "Headline", type: "text" },
      { key: "subtitleOverride", label: "Subtitle", type: "text" },
      { key: "ctaLabel", label: "Button text", type: "text", help: "e.g. Shop Wines" },
      { key: "ctaHref", label: "Button link", type: "url", help: "e.g. /wines" },
    ],
  },
  {
    key: "homepage_ambassador_strip",
    label: "Homepage Ambassador Strip",
    description: "The ambassador program callout on the homepage.",
    fields: [
      { key: "show", label: "Show this section", type: "bool" },
      { key: "headline", label: "Headline", type: "text" },
      { key: "ctaLabel", label: "Button text", type: "text" },
    ],
  },
  {
    key: "homepage_blocks_order",
    label: "Homepage Section Order",
    description: "Order of the main homepage sections.",
    fields: [
      {
        key: "order",
        label: "Section order (top → bottom)",
        type: "multi",
        help: "Pick sections in the order you want them.",
        options: [
          { value: "mission", label: "Mission" },
          { value: "shop", label: "Shop" },
          { value: "club", label: "Wine Club" },
          { value: "ambassador", label: "Ambassadors" },
        ],
      },
    ],
  },
  {
    key: "cart_promo_banner",
    label: "Cart Promo Banner",
    description: "The promo message shown in the cart.",
    fields: [
      { key: "headline", label: "Message", type: "text", help: 'e.g. "Shipping included on 12+"' },
      {
        key: "accent",
        label: "Color accent",
        type: "select",
        options: [
          { value: "primary", label: "Primary (red)" },
          { value: "secondary", label: "Secondary (grey)" },
          { value: "muted", label: "Muted" },
        ],
      },
    ],
  },
  {
    key: "club_featured_tier",
    label: "Wine Club Featured Tier",
    description: "Which club tier gets the 'Most Popular' badge.",
    fields: [
      {
        key: "tierKey",
        label: "Featured tier",
        type: "select",
        options: [
          { value: "3", label: "3 bottles" },
          { value: "6", label: "6 bottles" },
          { value: "12", label: "12 bottles" },
        ],
      },
    ],
  },
  {
    key: "ambassador_placement",
    label: "Ambassador CTA Placement",
    description: "Where the 'Become an Ambassador' button appears.",
    fields: [
      { key: "footer", label: "Show in footer", type: "bool" },
      { key: "sticky", label: "Show as sticky bar", type: "bool" },
      { key: "postPurchase", label: "Show after purchase", type: "bool" },
    ],
  },
  {
    key: "pdp_layout",
    label: "Product Detail Layout",
    description: "How a wine product page is arranged.",
    fields: [
      {
        key: "variant",
        label: "Layout style",
        type: "select",
        options: [
          { value: "image_first", label: "Image first" },
          { value: "story_first", label: "Story first" },
          { value: "reviews_first", label: "Reviews first" },
        ],
      },
    ],
  },
];

export function getSchema(slotKey: string): SlotSchema | undefined {
  return SLOT_SCHEMAS.find((s) => s.key === slotKey);
}

/** Strip empty/undefined fields so the saved config stays clean. */
export function cleanConfig(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** Human-readable summary of a saved config, for display cards. */
export function summarizeConfig(slotKey: string, cfg: Record<string, unknown>): { label: string; value: string }[] {
  const schema = getSchema(slotKey);
  if (!schema) {
    return Object.entries(cfg).map(([k, v]) => ({ label: k, value: String(v) }));
  }
  return schema.fields
    .map((f) => {
      const raw = (cfg as Record<string, unknown>)[f.key];
      if (raw === undefined || raw === null || raw === "") return null;
      let value = "";
      if (f.type === "bool") value = raw ? "Yes" : "No";
      else if (f.type === "select") {
        const opt = f.options.find((o) => o.value === String(raw));
        value = opt ? opt.label : String(raw);
      } else if (f.type === "multi") {
        const arr = Array.isArray(raw) ? raw : [];
        value = arr
          .map((v) => f.options.find((o) => o.value === String(v))?.label ?? String(v))
          .join(" → ");
      } else value = String(raw);
      return { label: f.label, value };
    })
    .filter(Boolean) as { label: string; value: string }[];
}

/** Audience targeting options for personalization rules. */
export const AUDIENCE_OPTIONS = {
  device: [
    { value: "mobile", label: "Mobile" },
    { value: "tablet", label: "Tablet" },
    { value: "desktop", label: "Desktop" },
  ],
  authState: [
    { value: "guest", label: "Guests (signed out)" },
    { value: "member", label: "Members (signed in)" },
  ],
  geoIsUS: [
    { value: "true", label: "In the US" },
    { value: "false", label: "Outside the US" },
  ],
  hasAmbassadorRef: [
    { value: "true", label: "Came from an ambassador link" },
    { value: "false", label: "Did not come from an ambassador link" },
  ],
  referrer: [
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook" },
    { value: "google", label: "Google" },
    { value: "direct", label: "Direct / typed URL" },
  ],
};