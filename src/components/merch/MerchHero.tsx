import { useEffect, useMemo, useRef } from "react";
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

export const MerchHero = () => {
  const variantIndex = useMemo(() => pickVariantIndex(HERO_VARIANTS.length), []);
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