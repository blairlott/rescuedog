import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wine } from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import hero1Jpg from "@/assets/merch-hero.jpg";
import hero1Webp from "@/assets/merch-hero.webp";
import hero2Jpg from "@/assets/merch-hero-2.jpg";
import hero2Webp from "@/assets/merch-hero-2.webp";
import hero3Jpg from "@/assets/merch-hero-3.jpg";
import hero3Webp from "@/assets/merch-hero-3.webp";
import hero4Jpg from "@/assets/merch-hero-4.jpg";
import hero4Webp from "@/assets/merch-hero-4.webp";

type Variant = {
  id: string;
  jpg: string;
  webp: string;
  alt: string;
  eyebrow: string;
  headline: React.ReactNode;
  sub: string;
};

export const HERO_VARIANTS: Variant[] = [
  {
    id: "v1-vineyard-hug",
    jpg: hero1Jpg,
    webp: hero1Webp,
    alt: "Woman hugging her rescue dog in a vineyard at golden hour",
    eyebrow: "Gear that gives back · 50% of profits to rescue",
    headline: <>Wear the cause.<br />Spoil the pup.</>,
    sub: "Apparel, drinkware and pet gear designed in California, fulfilled from US partners, and built to support animal rescue every day.",
  },
  {
    id: "v2-porch-laugh",
    jpg: hero2Jpg,
    webp: hero2Webp,
    alt: "Woman laughing on a porch with a rescue dog resting on her lap",
    eyebrow: "Made for rescue families",
    headline: <>Soft tees.<br />Big tails.</>,
    sub: "Every shirt, mug and bandana helps fund the rescues bringing dogs home. Worn-in cotton, sharp design, real impact.",
  },
  {
    id: "v3-kitchen-bowl",
    jpg: hero3Jpg,
    webp: hero3Webp,
    alt: "Woman holding a ceramic bowl for an attentive rescue dog in a sunlit kitchen",
    eyebrow: "Feed the pack · Fund the cause",
    headline: <>Bowls, bandanas,<br />better bedtimes.</>,
    sub: "Pet gear and home goods that look great in your kitchen and put real food in rescue bowls. Half the profit goes back.",
  },
  {
    id: "v4-vineyard-walk",
    jpg: hero4Jpg,
    webp: hero4Webp,
    alt: "Woman walking her rescue dog down a vineyard row at sunset",
    eyebrow: "Every purchase walks a dog home",
    headline: <>Gear up.<br />Give back.</>,
    sub: "Hoodies, leashes and everyday essentials — designed for the rescue life, built to fund forever homes.",
  },
];

const ASSET_FALLBACK_MAP: Record<string, string> = {
  "/src/assets/merch-hero.jpg": hero1Jpg,
  "/src/assets/merch-hero-2.jpg": hero2Jpg,
  "/src/assets/merch-hero-3.jpg": hero3Jpg,
  "/src/assets/merch-hero-4.jpg": hero4Jpg,
};
function resolveImageUrl(url: string): string {
  return ASSET_FALLBACK_MAP[url] ?? url;
}

type DbVariant = {
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

const STORAGE_KEY = "rdw_hero_rotation_idx";
const SESSION_KEY = "rdw_session_id";
const COOKIE_KEY = "rdw_hero_variant";
const STATS_CACHE_KEY = "rdw_hero_stats_v1";
const STATS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const EXPLORATION_FLOOR = 80; // min impressions per variant before bandit takes over
const ORDER_WEIGHT = 8; // 1 attributed order ≈ 8 clicks in reward signal
const VARIANTS_CACHE_KEY = "rdw_merch_hero_variants_v1";
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
  // 90-day attribution window for Shopify order matching
  try {
    const maxAge = 60 * 60 * 24 * 90;
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(variantId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    /* noop */
  }
}

function pickVariantIndex(total: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const prev = raw ? parseInt(raw, 10) : -1;
    const next = (Number.isFinite(prev) ? prev + 1 : 0) % total;
    localStorage.setItem(STORAGE_KEY, String(next));
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

// Sample from Beta(alpha, beta) via two Gammas (Marsaglia & Tsang).
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
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); // standard normal
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

function pickDbVariant(variants: DbVariant[], stats: VariantStat[] | null): DbVariant {
  if (variants.length === 0) throw new Error("no variants");
  if (!stats || stats.length === 0) return variants[pickVariantIndex(variants.length)];
  const byId = new Map(stats.map((s) => [s.variant_id, s]));
  const underExplored = variants.some((v) => {
    const r = byId.get(v.id);
    return !r || r.impressions < EXPLORATION_FLOOR;
  });
  if (underExplored) return variants[pickVariantIndex(variants.length)];
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

function readCachedVariants(): DbVariant[] | null {
  try {
    const raw = localStorage.getItem(VARIANTS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: DbVariant[] };
    if (Date.now() - ts > VARIANTS_TTL_MS) return null;
    return data;
  } catch { return null; }
}
function writeCachedVariants(data: DbVariant[]) {
  try { localStorage.setItem(VARIANTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* noop */ }
}

const FALLBACK_DB_VARIANTS: DbVariant[] = HERO_VARIANTS.map((v) => ({
  id: v.id,
  image_url: v.jpg,
  image_alt: v.alt,
  eyebrow: v.eyebrow,
  headline_html: typeof v.headline === "string" ? v.headline : "Wear the cause.<br/>Spoil the pup.",
  sub: v.sub,
  cta_label: "Shop Merch",
  cta_href: "/merch#products",
  sticky: false,
}));

export const MerchHero = () => {
  const [variants, setVariants] = useState<DbVariant[]>(() => readCachedVariants() ?? FALLBACK_DB_VARIANTS);
  const loggedImpression = useRef(false);
  const variant = useMemo(() => pickDbVariant(variants, readCachedStats()), [variants]);

  useEffect(() => {
    void supabase.rpc("get_active_hero_variants", { _surface: "merch" }).then(({ data, error }) => {
      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped: DbVariant[] = data.map((r: any) => ({
          id: r.id,
          image_url: resolveImageUrl(r.image_url),
          image_alt: r.image_alt ?? "",
          eyebrow: r.eyebrow ?? "",
          headline_html: r.headline_html ?? "",
          sub: r.sub ?? "",
          cta_label: r.cta_label ?? "Shop Merch",
          cta_href: r.cta_href ?? "/merch#products",
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
    setVariantCookie(variant.id);
    const session_id = getOrCreateSessionId();
    void supabase.from("hero_events").insert({
      variant_id: variant.id,
      event_type: "impression",
      session_id,
    });

    // Refresh stats cache in the background for the next pageview.
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
  }, [variant.id]);

  const handleCtaClick = () => {
    const session_id = getOrCreateSessionId();
    setVariantCookie(variant.id);
    void supabase.from("hero_events").insert({
      variant_id: variant.id,
      event_type: "click",
      session_id,
    });
  };

  return (
    <section className="relative h-[70vh] min-h-[520px] flex items-center bg-foreground">
      <picture>
        <img
          src={variant.image_url}
          alt={variant.image_alt}
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          width={1920}
          height={1080}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/40 to-transparent" />
      <div className="relative container mx-auto px-4">
        <p className="text-primary-foreground/90 text-xs md:text-sm tracking-brand uppercase mb-4 font-bold">
          {variant.eyebrow}
        </p>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-primary-foreground mb-6 max-w-3xl leading-tight">
          <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(variant.headline_html, { ALLOWED_TAGS: ["br", "b", "i", "em", "strong", "span"], ALLOWED_ATTR: [] }) }} />
        </h1>
        <p className="text-primary-foreground/85 max-w-xl mb-8 text-base md:text-lg">
          {variant.sub}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
          >
            <Link to={variant.cta_href} onClick={handleCtaClick} data-hero-variant={variant.id}>
              {variant.cta_label}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="bg-transparent text-primary-foreground border-primary-foreground/60 hover:bg-primary-foreground hover:text-foreground uppercase tracking-brand text-sm font-bold px-10 py-6"
          >
            <Link to="/wines">
              <Wine className="mr-2 h-4 w-4" /> Shop Wines
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};