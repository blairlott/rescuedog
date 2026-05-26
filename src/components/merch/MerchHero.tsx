import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wine } from "lucide-react";
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

const STORAGE_KEY = "rdw_hero_rotation_idx";
const SESSION_KEY = "rdw_session_id";
const COOKIE_KEY = "rdw_hero_variant";
const STATS_CACHE_KEY = "rdw_hero_stats_v1";
const STATS_TTL_MS = 10 * 60 * 1000; // 10 minutes
const EXPLORATION_FLOOR = 200; // min impressions per variant before bandit takes over
const ORDER_WEIGHT = 8; // 1 attributed order ≈ 8 clicks in reward signal

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

/**
 * Thompson Sampling bandit. Reward = clicks + ORDER_WEIGHT * orders.
 * Trials = impressions. Until every variant has EXPLORATION_FLOOR
 * impressions, fall back to round-robin so we collect baseline data.
 */
function pickVariantBandit(stats: VariantStat[] | null): number | null {
  if (!stats || stats.length === 0) return null;
  const byId = new Map(stats.map((s) => [s.variant_id, s]));
  const rows = HERO_VARIANTS.map((v) => byId.get(v.id));
  const underExplored = rows.some((r) => !r || r.impressions < EXPLORATION_FLOOR);
  if (underExplored) return null;

  let bestIdx = 0;
  let bestScore = -Infinity;
  rows.forEach((r, i) => {
    const impressions = r!.impressions;
    const reward = r!.clicks + ORDER_WEIGHT * r!.orders;
    const alpha = Math.max(1, reward) + 1;
    const beta = Math.max(0, impressions - reward) + 1;
    const sample = sampleBeta(alpha, beta);
    if (sample > bestScore) {
      bestScore = sample;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export const MerchHero = () => {
  // Synchronous pick: use cached stats if fresh; else round-robin so the hero
  // renders instantly without waiting on a network round-trip.
  const variantIndex = useMemo(() => {
    const cached = readCachedStats();
    const banditPick = pickVariantBandit(cached);
    return banditPick ?? pickVariantIndex(HERO_VARIANTS.length);
  }, []);
  const variant = HERO_VARIANTS[variantIndex];
  const loggedImpression = useRef(false);

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
        <source srcSet={variant.webp} type="image/webp" />
        <img
          src={variant.jpg}
          alt={variant.alt}
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
          {variant.headline}
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
            <a href="#products" onClick={handleCtaClick} data-hero-variant={variant.id}>
              Shop Merch
            </a>
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