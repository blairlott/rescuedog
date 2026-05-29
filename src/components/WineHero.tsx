import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { T } from "@/components/T";
import hero1Jpg from "@/assets/wine-hero-1.jpg";
import hero1Webp from "@/assets/wine-hero-1.webp";
import hero2Jpg from "@/assets/wine-hero-2.jpg";
import hero2Webp from "@/assets/wine-hero-2.webp";
import hero3Jpg from "@/assets/wine-hero-3.jpg";
import hero4Jpg from "@/assets/wine-hero-4.jpg";

// Images and copy rotate INDEPENDENTLY so the bandit can find the best
// image × copy pairing. variant_id logged to hero_events is `${imgId}__${copyId}`,
// giving 16 cells across 4 images and 4 copy decks.
type ImageVariant = {
  id: string;
  jpg: string;
  webp: string;
  alt: string;
};

type CopyVariant = {
  id: string;
  eyebrow: string;
  headline: React.ReactNode;
  sub: string;
  cta: string;
  ctaHref: string; // every CTA drives to a wine-sales surface (Vinoshipper handoff)
};

export const WINE_HERO_IMAGES: ImageVariant[] = [
  { id: "img1-cheers-cab",      jpg: hero1Jpg, webp: hero1Webp, alt: "Friends laughing and toasting glasses of Rescue Dog Wines Cabernet Sauvignon on a sunlit patio at golden hour" },
  { id: "img2-couples-dog",     jpg: hero2Jpg, webp: hero2Webp, alt: "Two couples sharing Rescue Dog Wines Red Blend by candlelight at a dinner table with a scruffy rescue dog seated beside them" },
];

// Each copy deck leans on a different psychological lever for conversions:
// mission, sustainability, social proof, scarcity/club value.
export const WINE_HERO_COPY: CopyVariant[] = [
  {
    id: "copy-mission",
    eyebrow: "Lodi Cabernet · 50% of profits to rescue",
    headline: <>Pour for<br />the pack.</>,
    sub: "Award-winning, sustainably grown Lodi wines. Every bottle helps a rescue dog find a forever home.",
    cta: "Shop Wines",
    ctaHref: "/wines",
  },
  {
    id: "copy-club",
    eyebrow: "Wine Club · members-only releases",
    headline: <>Save dogs.<br />Sip the proof.</>,
    sub: "Join the Wine Club for member pricing, exclusive releases, and a direct line to the rescues we fund.",
    cta: "Join the Wine Club",
    ctaHref: "/club",
  },
];

// Back-compat shim for analytics page: surfaces every (image × copy) cell.
export const WINE_HERO_VARIANTS = WINE_HERO_IMAGES.flatMap((img) =>
  WINE_HERO_COPY.map((cp) => ({
    id: `${img.id}__${cp.id}`,
    eyebrow: cp.eyebrow,
    headline: cp.headline,
    sub: cp.sub,
  }))
);

// Map fallback asset paths (used by seed rows referencing /src/assets/...) to bundled URLs.
const ASSET_FALLBACK_MAP: Record<string, string> = {
  "/src/assets/wine-hero-1.jpg": hero1Jpg,
  "/src/assets/wine-hero-2.jpg": hero2Jpg,
  "/src/assets/wine-hero-3.jpg": hero3Jpg,
  "/src/assets/wine-hero-4.jpg": hero4Jpg,
};
function resolveImageUrl(url: string): string {
  return ASSET_FALLBACK_MAP[url] ?? url;
}

type DbHeroVariant = {
  id: string;
  image_url: string;
  image_alt: string;
  eyebrow: string;
  headline_html: string;
  sub: string;
  cta_label: string;
  cta_href: string;
  sticky: boolean;
};

const IMG_STORAGE_KEY = "rdw_wine_hero_img_idx";
const COPY_STORAGE_KEY = "rdw_wine_hero_copy_idx";
const SESSION_KEY = "rdw_session_id";
const COOKIE_KEY = "rdw_hero_variant";
const STATS_CACHE_KEY = "rdw_wine_hero_stats_v1";
const STATS_TTL_MS = 10 * 60 * 1000;
const EXPLORATION_FLOOR = 80; // per variant
const ORDER_WEIGHT = 8; // 1 attributed order ≈ 8 clicks
const VARIANTS_CACHE_KEY = "rdw_wine_hero_variants_v1";
const VARIANTS_TTL_MS = 5 * 60 * 1000;

type VariantStat = {
  variant_id: string;
  impressions: number;
  clicks: number;
  orders: number;
  revenue: number;
};

function getOrCreateSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) as string;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function setVariantCookie(variantId: string) {
  try {
    const maxAge = 60 * 60 * 24 * 90;
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(variantId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* noop */
  }
}

function pickRoundRobin(key: string, total: number): number {
  try {
    const raw = localStorage.getItem(key);
    const prev = raw ? parseInt(raw, 10) : -1;
    const next = (Number.isFinite(prev) ? prev + 1 : 0) % total;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * total);
  }
}

function readCachedStats(): VariantStat[] | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: VariantStat[] };
    if (Date.now() - ts > STATS_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCachedStats(data: VariantStat[]) {
  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* noop */
  }
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      const u1 = Math.random();
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// Bandit over DB variants by id. Sticky variants get a small score boost.
function pickDbVariant(variants: DbHeroVariant[], stats: VariantStat[] | null): DbHeroVariant {
  if (variants.length === 0) throw new Error("no variants");
  if (!stats || stats.length === 0) {
    const idx = pickRoundRobin(IMG_STORAGE_KEY, variants.length);
    return variants[idx];
  }
  const byId = new Map(stats.map((s) => [s.variant_id, s]));
  const underExplored = variants.some((v) => {
    const r = byId.get(v.id);
    return !r || r.impressions < EXPLORATION_FLOOR;
  });
  if (underExplored) {
    const idx = pickRoundRobin(IMG_STORAGE_KEY, variants.length);
    return variants[idx];
  }
  let best = variants[0];
  let bestScore = -Infinity;
  for (const v of variants) {
    const r = byId.get(v.id)!;
    const reward = r.clicks + ORDER_WEIGHT * r.orders;
    const alpha = Math.max(1, reward) + 1;
    const beta = Math.max(0, r.impressions - reward) + 1;
    const s = sampleBeta(alpha, beta) + (v.sticky ? 0.05 : 0);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return best;
}

function readCachedVariants(): DbHeroVariant[] | null {
  try {
    const raw = localStorage.getItem(VARIANTS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: DbHeroVariant[] };
    if (Date.now() - ts > VARIANTS_TTL_MS) return null;
    return data;
  } catch { return null; }
}
function writeCachedVariants(data: DbHeroVariant[]) {
  try { localStorage.setItem(VARIANTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* noop */ }
}

// Fallback (offline / first load) — built from bundled assets + copy decks above.
const FALLBACK_VARIANTS: DbHeroVariant[] = WINE_HERO_IMAGES.map((img, i) => {
  const cp = WINE_HERO_COPY[i % WINE_HERO_COPY.length];
  const headline = typeof cp.headline === "string"
    ? cp.headline
    : "Pour for<br/>the pack.";
  return {
    id: `${img.id}__${cp.id}`,
    image_url: img.jpg,
    image_alt: img.alt,
    eyebrow: cp.eyebrow,
    headline_html: headline,
    sub: cp.sub,
    cta_label: cp.cta,
    cta_href: cp.ctaHref,
    sticky: false,
  };
});

export const WineHero = () => {
  const [variants, setVariants] = useState<DbHeroVariant[]>(() => readCachedVariants() ?? FALLBACK_VARIANTS);
  const loggedImpression = useRef(false);

  const variant = useMemo(() => {
    const cached = readCachedStats();
    return pickDbVariant(variants, cached);
  }, [variants]);
  const variantId = variant.id;

  useEffect(() => {
    // Refresh DB variants in background
    void supabase.rpc("get_active_hero_variants", { _surface: "wine" }).then(({ data, error }) => {
      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped: DbHeroVariant[] = data.map((r: any) => ({
          id: r.id,
          image_url: resolveImageUrl(r.image_url),
          image_alt: r.image_alt ?? "",
          eyebrow: r.eyebrow ?? "",
          headline_html: r.headline_html ?? "",
          sub: r.sub ?? "",
          cta_label: r.cta_label ?? "Shop Wines",
          cta_href: r.cta_href ?? "/wines",
          sticky: !!r.sticky,
        }));
        writeCachedVariants(mapped);
        setVariants(mapped);
      }
    });
  }, []);

  useEffect(() => {
    if (loggedImpression.current) return;
    loggedImpression.current = true;
    setVariantCookie(variantId);
    const session_id = getOrCreateSessionId();
    void supabase.from("hero_events").insert({
      variant_id: variantId,
      event_type: "impression",
      session_id,
    });
    void supabase
      .rpc("get_hero_variant_stats", { _days: 30 })
      .then(({ data, error }) => {
        if (!error && Array.isArray(data)) {
          writeCachedStats(
            data.map((r: any) => ({
              variant_id: r.variant_id,
              impressions: Number(r.impressions) || 0,
              clicks: Number(r.clicks) || 0,
              orders: Number(r.orders) || 0,
              revenue: Number(r.revenue) || 0,
            }))
          );
        }
      });
  }, [variantId]);

  const handleCtaClick = () => {
    const session_id = getOrCreateSessionId();
    setVariantCookie(variantId);
    void supabase.from("hero_events").insert({
      variant_id: variantId,
      event_type: "click",
      session_id,
    });
  };

  return (
    <section className="relative h-[90vh] min-h-[600px] flex items-center overflow-hidden bg-foreground">
      <picture>
        <img
          src={variant.image_url}
          alt={variant.image_alt}
          className="absolute inset-0 w-full h-full object-cover"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/45 to-transparent" />
      <div className="relative container mx-auto px-4">
        <div className="max-w-2xl">
          <p className="text-primary-foreground/90 text-xs md:text-sm tracking-brand uppercase mb-4 font-bold">
            <T>{variant.eyebrow}</T>
          </p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-primary-foreground mb-6 leading-[0.95] uppercase">
            <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(variant.headline_html, { ALLOWED_TAGS: ["br", "b", "i", "em", "strong", "span"], ALLOWED_ATTR: [] }) }} />
          </h1>
          <p className="text-primary-foreground/85 text-base md:text-lg mb-8 max-w-xl">
            <T>{variant.sub}</T>
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <Link
                to={variant.cta_href}
                onClick={handleCtaClick}
                data-hero-variant={variantId}
              >
                <T>{variant.cta_label}</T>
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="bg-transparent text-primary-foreground border-primary-foreground/60 hover:bg-primary-foreground hover:text-foreground uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <Link to="/store-locator">
                <MapPin className="mr-2 h-4 w-4" /> <T>Find a Store</T>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};