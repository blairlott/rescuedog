/**
 * Press logo asset map. Keys = press_mentions.outlet_slug.
 *
 * Sourcing rules (PART 2.6):
 *   1. Official press kit / outlet brand-assets page.
 *   2. Wikipedia / Wikimedia Commons fallback (CC / public-domain wordmarks).
 *   3. Never AI-generate or hand-approximate. If neither (1) nor (2) is
 *      available, the press_mention row is set to status='paused' and
 *      reported back, NOT shipped behind a placeholder.
 *
 * SVG is strongly preferred. The homepage strip applies `grayscale` so
 * monochrome variants are nice-to-have but not required.
 *
 * Current state: existing SVGs under src/assets/press-logos/ are stub
 * wordmarks placeholders awaiting authoritative replacement (see PART 2.6
 * sourcing report). gma3 entry is new and also pending authoritative SVG.
 */
import forbes from "@/assets/press-logos/forbes.svg";
import wineEnthusiast from "@/assets/press-logos/wine-enthusiast.svg";
import sfChronicle from "@/assets/press-logos/sf-chronicle.svg";
import lodi from "@/assets/press-logos/lodi-wine-commission.svg";
import gma3 from "@/assets/press-logos/gma3.svg";

export interface PressLogo {
  src: string;
  alt: string;
}

export const PRESS_LOGO_MAP: Record<string, PressLogo> = {
  gma3: { src: gma3, alt: "GMA3 — Good Morning America" },
  forbes: { src: forbes, alt: "Forbes" },
  "wine-enthusiast": { src: wineEnthusiast, alt: "Wine Enthusiast" },
  "sf-chronicle": { src: sfChronicle, alt: "San Francisco Chronicle" },
  "lodi-wine-commission": { src: lodi, alt: "Lodi Wine Commission" },
};

export const getPressLogo = (slug: string | null | undefined): PressLogo | null => {
  if (!slug) return null;
  return PRESS_LOGO_MAP[slug] ?? null;
};