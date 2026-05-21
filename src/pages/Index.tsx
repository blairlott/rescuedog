import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { ShippingIncludedBanner } from "@/components/ShippingIncludedBanner";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Loader2, ChevronDown, Volume2, VolumeX } from "lucide-react";
import { ShopifyProduct } from "@/lib/shopify";
import { isWineProduct, isRescueDogDomain } from "@/lib/productUtils";
import MerchHomePage from "./MerchHomePage";
import { useState, useRef, useCallback } from "react";
import heroRedBlend from "@/assets/hero-red-blend-v2.jpg";
import rdwHero from "@/assets/migrated/rdw-hero.jpg";
import lodiSustainable from "@/assets/migrated/lodi-sustainable.png";
import ig1 from "@/assets/migrated/ig-1.webp";
import ig2 from "@/assets/migrated/ig-2.webp";
import ig3 from "@/assets/migrated/ig-3.webp";
import ig4 from "@/assets/migrated/ig-4.webp";
import ig5 from "@/assets/migrated/ig-5.webp";
import ig6 from "@/assets/migrated/ig-6.webp";
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";
import { MissionStrip } from "@/components/MissionStrip";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PairingFinder } from "@/components/PairingFinder";
import { LazyYouTube } from "@/components/LazyYouTube";
import { RescueVoices } from "@/components/rescue/RescueVoices";
import { Seo } from "@/components/Seo";
import { InstacartOAuthCatcher } from "@/components/InstacartOAuthCatcher";
import { T } from "@/components/T";
import { useExperiment } from "@/hooks/useExperiment";

const instagramPosts = [
  {
    image: ig1,
    url: "https://www.instagram.com/p/DLIV_-zT9F-/",
    caption: "There's no better season than summer to gather with friends outdoors and savor our acclaimed sustainable wines.",
  },
  {
    image: ig2,
    url: "https://www.instagram.com/p/DLDKygESqiN/",
    caption: "Rescue Dog Wines teams up with the Humane Society of Truckee-Tahoe for the Truckee Reggae Festival!",
  },
  {
    image: ig3,
    url: "https://www.instagram.com/p/DK-Km3iTBM6/",
    caption: "Isn't it awesome when that package from the Rescue Dog Wine Club shows up at your door?",
  },
  {
    image: ig4,
    url: "https://www.instagram.com/p/DK9vmEkzdNr/",
    caption: "Rescue Dog Wines is excited to team up with the Siskiyou Humane Society!",
  },
  {
    image: ig5,
    url: "https://www.instagram.com/p/DK4xNDRzSUC/",
    caption: "In honor of Father's Day, Rescue Dog Wines asks, 'What kind of dog dad are you?'",
  },
  {
    image: ig6,
    url: "https://www.instagram.com/reel/DK2XSDit-Yn/",
    caption: "Happy Father's Day to all the Dads and Dog Dads!",
  },
];

type EditSection = "hero" | "mission" | "about_us" | "lodi" | "club_cta" | null;

const Index = () => {
  const { data: products, isLoading } = useProducts(50);
  const [isMuted, setIsMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { content, upsert } = useCmsContent("homepage");
  const [editSection, setEditSection] = useState<EditSection>(null);
  const showImpact = useFeatureFlag("impact_counter", false);

  // Self-optimizing hero. Overrides apply on top of CMS values.
  const hero = useExperiment<{
    imageUrl?: string;
    headlineOverride?: string;
    subtitleOverride?: string;
    ctaLabel?: string;
    ctaHref?: string;
  }>("homepage_hero", {});

  // Self-optimizing ambassador strip placement on homepage.
  const ambassadorStrip = useExperiment<{ show?: boolean; headline?: string; ctaLabel?: string }>(
    "homepage_ambassador_strip",
    { show: false },
  );

  const getVal = (key: string, field: string, fallback: string) => getCmsValue(content, key, field, fallback);

  const handleSave = (sectionKey: string) => (values: Record<string, string>) => {
    upsert.mutate({ sectionKey, content: values }, {
      onSuccess: () => setEditSection(null),
    });
  };

  const sectionFields: Record<string, { title: string; fields: CmsField[] }> = {
    hero: {
      title: "Homepage Hero",
      fields: [
        { key: "headline", label: "Headline (line 1)", type: "text", value: getVal("hero", "headline", "Our Wine") },
        { key: "headline2", label: "Headline (line 2)", type: "text", value: getVal("hero", "headline2", "Is For The") },
        { key: "headline3", label: "Headline (line 3)", type: "text", value: getVal("hero", "headline3", "Dogs") },
        { key: "subtitle", label: "Subtitle", type: "textarea", value: getVal("hero", "subtitle", "Award-winning, sustainable wines. 50% of our profits support animal rescue organizations.") },
      ],
    },
    mission: {
      title: "Mission Statement",
      fields: [
        { key: "tagline", label: "Tagline", type: "text", value: getVal("mission", "tagline", "Our wine is for the dogs") },
        { key: "heading", label: "Heading", type: "text", value: getVal("mission", "heading", "50% of our PROFITS SUPPORT RESCUE ORGANIZATIONS") },
        { key: "paragraph1", label: "Paragraph 1", type: "textarea", value: getVal("mission", "paragraph1", "At Rescue Dog Wines®, we craft award-winning wines from sustainable grapes. Enjoy our wines knowing half our profits support animal rescue organizations.") },
        { key: "paragraph2", label: "Paragraph 2", type: "textarea", value: getVal("mission", "paragraph2", "Rescue Dog™ ships to most of the US from our online store!") },
        { key: "image", label: "Image URL", type: "url", value: getVal("mission", "image", rdwHero) },
      ],
    },
    about_us: {
      title: "About Us Section",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("about_us", "heading", "Responsible, Sustainable, Exceptional.") },
        { key: "body", label: "Body", type: "textarea", value: getVal("about_us", "body", "Our mission is to support the placement of as many rescue dogs as possible into loving homes through wine sales and donations. Our business is producing fine wines; our passion is helping rescue dogs.") },
      ],
    },
    lodi: {
      title: "Lodi Rules Section",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("lodi", "heading", "Lodi Rules Certified Green") },
        { key: "body", label: "Body", type: "textarea", value: getVal("lodi", "body", "Our grapes are grown under one of the most rigorous third-party sustainability certifications in the wine industry, ensuring every bottle is as responsible as it is delicious.") },
      ],
    },
    club_cta: {
      title: "Wine Club CTA",
      fields: [
        { key: "heading", label: "Heading", type: "text", value: getVal("club_cta", "heading", "Club") },
        { key: "body", label: "Body", type: "textarea", value: getVal("club_cta", "body", "Get 20% off wine purchases! Join us in our commitment to support animal rescue organizations and receive regular shipments of award-winning wines — plus perks!") },
      ],
    },
  };

  const toggleMute = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: isMuted ? 'unMute' : 'mute', args: [] }),
        '*'
      );
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  if (isRescueDogDomain()) {
    return <MerchHomePage />;
  }

  const wines = products?.filter((p: ShopifyProduct) => isWineProduct(p)) || [];
  const merch = products?.filter((p: ShopifyProduct) => !isWineProduct(p)) || [];

  const scrollToContent = () => {
    document.getElementById("mission-section")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <InstacartOAuthCatcher />
      <Seo
        title="Award-Winning Sustainable Wines That Help Rescue Dogs"
        description="Lodi-grown, sustainably crafted wines. 50% of profits support animal rescue. Flat $9.99 shipping on 6+ bottles, included on 12+. Join the Wine Club for 20% off."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Rescue Dog Wines",
          url: "https://rescuedogwines.com",
          logo: "https://rescuedogwines.myshopify.com/cdn/shop/files/rdw_black_4x_7dece252-0ae7-4039-b832-0a86b7adec60.png",
          sameAs: ["https://www.instagram.com/rescuedogwines"],
        }}
      />
      <Header />

      {/* Hero — Full-bleed image background */}
      <section className="relative h-[90vh] min-h-[600px] flex items-center overflow-hidden">
        <CmsEditButton onClick={() => setEditSection("hero")} />
        <img
          src={hero.config.imageUrl || heroRedBlend}
          alt="Friends enjoying Rescue Dog Wines with the 2023 Red Blend"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-foreground/30" />

        <div className="relative container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-primary-foreground mb-6 leading-[0.9] uppercase">
              {hero.config.headlineOverride ? (
                <T>{hero.config.headlineOverride}</T>
              ) : (
                <>
                  <T>{getVal("hero", "headline", "Our Wine")}</T><br />
                  <T>{getVal("hero", "headline2", "Is For The")}</T><br />
                  <T>{getVal("hero", "headline3", "Dogs")}</T>
                </>
              )}
            </h1>
            <p className="text-primary-foreground/80 text-lg mb-8 max-w-md">
              <T>{hero.config.subtitleOverride || getVal("hero", "subtitle", "Award-winning, sustainable wines. 50% of our profits support animal rescue organizations.")}</T>
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
                onClick={() => hero.recordConversion("hero_cta_click")}
              >
                <Link to={hero.config.ctaHref || "/wines"}><T>{hero.config.ctaLabel || "Shop Wines"}</T></Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <Link to="/store-locator"><T>Find a Store</T></Link>
              </Button>
            </div>
          </div>

          {/* Bottle Image Overlay */}
          <div className="hidden lg:block">
            <img
              src="https://cdn.shopify.com/s/files/1/0599/6580/0542/files/redblend2023.png?v=1774391461"
              alt="2023 Red Blend | Rescue Dog Wines"
              className="h-[500px] w-auto drop-shadow-2xl"
            />
          </div>
        </div>

        {/* Scroll Indicator */}
        <button
          onClick={scrollToContent}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-primary-foreground/60 hover:text-primary-foreground transition-colors animate-bounce"
          aria-label="Scroll down"
        >
          <ChevronDown className="h-8 w-8" />
        </button>
      </section>

      {/* Mission Statement */}
      <section id="mission-section" className="py-16 md:py-24 relative">
        <CmsEditButton onClick={() => setEditSection("mission")} />
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-sm tracking-brand uppercase text-primary font-bold mb-2">
                <T>{getVal("mission", "tagline", "Our wine is for the dogs")}</T>
              </p>
              <h2 className="text-sm font-bold tracking-brand uppercase text-foreground mb-4">
                <T>{getVal("mission", "heading", "50% of our PROFITS SUPPORT RESCUE ORGANIZATIONS")}</T>
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                <T>{getVal("mission", "paragraph1", "At Rescue Dog Wines®, we craft award-winning wines from sustainable grapes. Enjoy our wines knowing half our profits support animal rescue organizations.")}</T>
              </p>
              <p className="text-foreground mb-6">
                <T>{getVal("mission", "paragraph2", "Rescue Dog™ ships to most of the US from our online store!")}</T>
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
                >
                  <Link to="/shop">Shop Online</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10 py-6"
                >
                  <Link to="/store-locator">Find a Store</Link>
                </Button>
              </div>
            </div>
            <div className="aspect-[4/3] bg-secondary overflow-hidden">
              <img
                src={getVal("mission", "image", rdwHero)}
                alt="Rescue Dog Wines bottles"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Winemaker-driven band */}
      <section className="py-12 md:py-16 bg-foreground text-primary-foreground">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <p className="text-xs tracking-brand uppercase text-primary-foreground/60 mb-3 font-bold">
            <T>Winemaker-Driven</T>
          </p>
          <h2 className="text-2xl md:text-4xl font-bold uppercase leading-tight mb-4">
            <T>Crafted by Susana Rodriguez Vasquez — vine to glass.</T>
          </h2>
          <p className="text-primary-foreground/80 leading-relaxed max-w-2xl mx-auto">
            <T>Every Rescue Dog wine is varietally correct and intentionally made — guided from the vineyard to the glass by our Chief Consulting Winemaker, Susy Vasquez. No shortcuts, no house-style blending at scale. Just honest, expressive Lodi wines.</T>
          </p>
        </div>
      </section>

      {/* Press / As Seen In strip */}
      <section className="py-8 border-y border-border bg-background">
        <div className="container mx-auto px-4">
          <p className="text-[11px] tracking-brand uppercase text-muted-foreground text-center mb-4 font-bold">
            <T>As Featured In</T>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-foreground/70">
            {["Wine Enthusiast", "USA Today", "Forbes", "SF Chronicle", "Lodi Wine Commission"].map((name) => (
              <span key={name} className="text-sm md:text-base font-bold uppercase tracking-brand opacity-70 hover:opacity-100 transition-opacity">
                <T>{name}</T>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Why Lodi — 3-tile explainer */}
      <section className="py-16 md:py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2 font-bold">
              <T>Why Lodi</T>
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground uppercase">
              <T>The Right Place For Honest Wine</T>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="border border-border p-6 text-center">
              <p className="text-xs tracking-brand uppercase text-primary font-bold mb-3"><T>Mediterranean Climate</T></p>
              <p className="text-sm text-foreground leading-relaxed">
                <T>Warm days, cool Delta breezes. Grapes ripen evenly with the natural acid balance that defines varietally correct wine.</T>
              </p>
            </div>
            <div className="border border-border p-6 text-center">
              <p className="text-xs tracking-brand uppercase text-primary font-bold mb-3"><T>Old-Vine Heritage</T></p>
              <p className="text-sm text-foreground leading-relaxed">
                <T>Some of the oldest continuously farmed vines in California. Deep roots, low yields, concentrated flavor — character no young vineyard can fake.</T>
              </p>
            </div>
            <div className="border border-border p-6 text-center">
              <p className="text-xs tracking-brand uppercase text-primary font-bold mb-3"><T>Lodi Rules Certified</T></p>
              <p className="text-sm text-foreground leading-relaxed">
                <T>One of the most rigorous third-party sustainability certifications in the wine industry. Every bottle is as responsible as it is delicious.</T>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Wines */}
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-bold text-foreground">Our Wines</h2>
            <Link to="/wines" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : wines.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No wines found.</p>
          ) : (
            <>
              <ShippingIncludedBanner />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {wines.slice(0, 10).map((product: ShopifyProduct) => (
                  <ProductCard key={product.node.id} product={product} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Video Background Section */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center overflow-hidden">
        <LazyYouTube
          videoId="rNxSRJpqz_w"
          title="Rescue Dog Wines"
          className="absolute inset-0 w-full h-full"
          iframeRef={iframeRef}
        />
        <div className="absolute inset-0 bg-foreground/40 pointer-events-none" />
        <div className="relative container mx-auto px-4 text-center z-10">
          <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4 uppercase">
            50% of Profits Support Rescue Organizations
          </h2>
          <p className="text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            Every bottle you enjoy helps rescue dogs find their forever homes.
          </p>
        </div>
        <button
          onClick={toggleMute}
          className="absolute bottom-6 right-6 text-primary-foreground/60 hover:text-primary-foreground transition-colors z-10 bg-foreground/30 backdrop-blur-sm p-2 rounded-full"
          aria-label={isMuted ? "Unmute video" : "Mute video"}
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </section>

      {/* AI Pairing Finder */}
      <PairingFinder />

      {/* Voices from the rescues we fund — rotating real partner blurbs */}
      <RescueVoices />

      {/* About Us Section */}
      <section className="py-16 md:py-24 relative">
        <CmsEditButton onClick={() => setEditSection("about_us")} />
        <div className="container mx-auto px-4 max-w-3xl text-center">
            <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2"><T>About us:</T></p>
            <h2 className="text-3xl md:text-4xl font-bold text-primary leading-tight mb-4">
              <T>{getVal("about_us", "heading", "Responsible, Sustainable, Exceptional.")}</T>
            </h2>
            <p className="text-foreground leading-relaxed mb-6">
              <T>{getVal("about_us", "body", "Our mission is to support the placement of as many rescue dogs as possible into loving homes through wine sales and donations. Our business is producing fine wines; our passion is helping rescue dogs.")}</T>
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10"
            >
              <Link to="/about"><T>Learn About Our Mission</T></Link>
            </Button>
        </div>
      </section>

      {/* Lodi Rules */}
      <section className="py-16 bg-secondary relative">
        <CmsEditButton onClick={() => setEditSection("lodi")} />
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="flex justify-center">
              <img
                src={lodiSustainable}
                alt="Lodi Rules Sustainable Winegrowing certification"
                className="max-w-[250px] w-full h-auto"
              />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                <T>{getVal("lodi", "heading", "Lodi Rules Certified Green")}</T>
              </h2>
              <p className="text-foreground leading-relaxed mb-6">
                <T>{getVal("lodi", "body", "Our grapes are grown under one of the most rigorous third-party sustainability certifications in the wine industry, ensuring every bottle is as responsible as it is delicious.")}</T>
              </p>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10"
              >
                <Link to="/vineyard"><T>Learn About Our Vineyard</T></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Ambassador Program callout */}
      <section className="py-14 bg-foreground text-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <p className="text-xs tracking-brand uppercase opacity-70 mb-2"><T>Affiliate Program · Powered by impact.com</T></p>
          <h2 className="text-2xl md:text-3xl font-bold uppercase mb-4"><T>Turn Your Love for Rescue Dogs into Commission</T></h2>
          <p className="opacity-90 max-w-2xl mx-auto mb-6 text-sm md:text-base">
            <T>Nonprofits, enthusiasts, and influencers earn percentage-based commission on every bottle sold through their personal link — automatic tracking, automatic payments, no contractor paperwork on your end.</T>
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="uppercase tracking-brand">
              <Link to="/ambassadors"><T>Become an Ambassador</T></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent border-background text-background hover:bg-background hover:text-foreground uppercase tracking-brand">
              <Link to="/ambassadors/find"><T>Find an Ambassador</T></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Events Preview */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-bold text-foreground"><T>Events</T></h2>
            <Link to="/events" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
              <T>View More Events</T> <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-border p-6 hover:border-primary transition-colors">
              <p className="text-sm text-primary font-bold uppercase tracking-brand mb-1">April 2026</p>
              <h3 className="text-xl font-bold text-foreground mb-2">Birthday Block Party</h3>
              <p className="text-sm text-muted-foreground mb-3">April 18, 2026 · All Day Event</p>
              <Link to="/events" className="text-sm text-primary hover:underline font-medium">More Info →</Link>
            </div>
            <div className="border border-border p-6 hover:border-primary transition-colors">
              <p className="text-sm text-primary font-bold uppercase tracking-brand mb-1">April 2026</p>
              <h3 className="text-xl font-bold text-foreground mb-2">Spay-ghetti & No Balls Dinner</h3>
              <p className="text-sm text-muted-foreground mb-3">April 18, 2026 · 7:00 pm - 10:00 pm</p>
              <Link to="/events" className="text-sm text-primary hover:underline font-medium">More Info →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Instagram Feed */}
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-foreground mb-2">@rescuedogwines</h2>
            <a
              href="https://www.instagram.com/rescuedogwines/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline uppercase tracking-brand font-bold"
            >
              <T>Follow Us on Instagram</T>
            </a>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {instagramPosts.map((post) => (
              <a
                key={post.url}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square overflow-hidden group relative"
              >
                <img
                  src={post.image}
                  alt={post.caption}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/50 transition-colors flex items-center justify-center">
                  <p className="text-primary-foreground text-xs text-center px-2 opacity-0 group-hover:opacity-100 transition-opacity line-clamp-3">
                    {post.caption}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Wine Club CTA */}
      <section className="py-16 md:py-24 relative">
        <CmsEditButton onClick={() => setEditSection("club_cta")} />
        <div className="container mx-auto px-4">
          <div className="bg-primary p-8 md:p-16 text-center">
            <p className="text-primary-foreground/80 text-sm uppercase tracking-brand font-bold mb-2"><T>Join Our</T></p>
            <h2 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">
              <T>{getVal("club_cta", "heading", "Club")}</T>
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto mb-4">
              <T>{getVal("club_cta", "body", "Get 20% off wine purchases! Join us in our commitment to support animal rescue organizations and receive regular shipments of award-winning wines — plus perks!")}</T>
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <Link to="/club"><T>Learn More & Join</T></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Merch Section */}
      {merch.length > 0 && (
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-2xl font-bold text-foreground"><T>Merch & Accessories</T></h2>
              <Link to="/merch" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
                <T>View All</T> <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              {merch.slice(0, 5).map((product: ShopifyProduct) => (
                <ProductCard key={product.node.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {showImpact && <MissionStrip />}

      {/* Wholesale CTA */}
      <section className="py-12 border-t border-border">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-bold text-foreground text-sm uppercase tracking-brand"><T>Trade & Media</T></p>
              <p className="text-sm text-muted-foreground"><T>Interested in carrying our wines? Let's talk.</T></p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="uppercase tracking-brand text-xs font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-8"
          >
            <Link to="/wholesale"><T>Learn More</T></Link>
          </Button>
        </div>
      </section>

      <Footer />

      {/* CMS Edit Dialogs */}
      {editSection && sectionFields[editSection] && (
        <CmsEditDialog
          open={!!editSection}
          onOpenChange={(open) => { if (!open) setEditSection(null); }}
          title={sectionFields[editSection].title}
          fields={sectionFields[editSection].fields}
          onSave={handleSave(editSection)}
          isSaving={upsert.isPending}
        />
      )}
    </div>
  );
};

export default Index;
