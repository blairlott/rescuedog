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
import { useCmsContent, getCmsValue } from "@/hooks/useCmsContent";
import { CmsEditButton } from "@/components/cms/CmsEditButton";
import { CmsEditDialog, CmsField } from "@/components/cms/CmsEditDialog";
import { ImpactCounter } from "@/components/ImpactCounter";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { PairingFinder } from "@/components/PairingFinder";
import { LazyYouTube } from "@/components/LazyYouTube";
import { Seo } from "@/components/Seo";

const instagramPosts = [
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/509200012_18274825045278452_9128659293986212215_nfull.webp",
    url: "https://www.instagram.com/p/DLIV_-zT9F-/",
    caption: "There's no better season than summer to gather with friends outdoors and savor our acclaimed sustainable wines.",
  },
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/509593828_18274607290278452_6667065609178035295_nfull.webp",
    url: "https://www.instagram.com/p/DLDKygESqiN/",
    caption: "Rescue Dog Wines teams up with the Humane Society of Truckee-Tahoe for the Truckee Reggae Festival!",
  },
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/508621501_18274405666278452_6272862151890429357_nfull.webp",
    url: "https://www.instagram.com/p/DK-Km3iTBM6/",
    caption: "Isn't it awesome when that package from the Rescue Dog Wine Club shows up at your door?",
  },
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/505850797_1164084389096508_4424757564102632030_nfull.webp",
    url: "https://www.instagram.com/p/DK9vmEkzdNr/",
    caption: "Rescue Dog Wines is excited to team up with the Siskiyou Humane Society!",
  },
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/505430600_18274161556278452_5065465879235968056_nfull.webp",
    url: "https://www.instagram.com/p/DK4xNDRzSUC/",
    caption: "In honor of Father's Day, Rescue Dog Wines asks, 'What kind of dog dad are you?'",
  },
  {
    image: "https://rescuedogwines.com/wp-content/uploads/sb-instagram-feed-images/505464961_1124419793044014_993106266832108770_nfull.webp",
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
        { key: "image", label: "Image URL", type: "url", value: getVal("mission", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/rescue-dog-wines-1.jpg") },
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
      <Seo
        title="Award-Winning Sustainable Wines That Help Rescue Dogs"
        description="Lodi-grown, sustainably crafted wines. 50% of profits support animal rescue. Shipping included on 6+ bottles. Join the Wine Club for 20% off."
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
          src={heroRedBlend}
          alt="Friends enjoying Rescue Dog Wines with the 2023 Red Blend"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-foreground/30" />

        <div className="relative container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-primary-foreground mb-6 leading-[0.9] uppercase">
              {getVal("hero", "headline", "Our Wine")}<br />
              {getVal("hero", "headline2", "Is For The")}<br />
              {getVal("hero", "headline3", "Dogs")}
            </h1>
            <p className="text-primary-foreground/80 text-lg mb-8 max-w-md">
              {getVal("hero", "subtitle", "Award-winning, sustainable wines. 50% of our profits support animal rescue organizations.")}
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <Link to="/wines">Shop Wines</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 uppercase tracking-brand text-sm font-bold px-10 py-6"
              >
                <Link to="/store-locator">Find a Store</Link>
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
                {getVal("mission", "tagline", "Our wine is for the dogs")}
              </p>
              <h2 className="text-sm font-bold tracking-brand uppercase text-foreground mb-4">
                {getVal("mission", "heading", "50% of our PROFITS SUPPORT RESCUE ORGANIZATIONS")}
              </h2>
              <p className="text-foreground leading-relaxed mb-4">
                {getVal("mission", "paragraph1", "At Rescue Dog Wines®, we craft award-winning wines from sustainable grapes. Enjoy our wines knowing half our profits support animal rescue organizations.")}
              </p>
              <p className="text-foreground mb-6">
                {getVal("mission", "paragraph2", "Rescue Dog™ ships to most of the US from our online store!")}
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
                src={getVal("mission", "image", "https://rescuedogwines.com/wp-content/uploads/2023/09/rescue-dog-wines-1.jpg")}
                alt="Rescue Dog Wines bottles"
                className="w-full h-full object-cover"
              />
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

      {/* About Us Section */}
      <section className="py-16 md:py-24 relative">
        <CmsEditButton onClick={() => setEditSection("about_us")} />
        <div className="container mx-auto px-4 max-w-3xl text-center">
            <p className="text-xs tracking-brand uppercase text-muted-foreground mb-2">About us:</p>
            <h2 className="text-3xl md:text-4xl font-bold text-primary leading-tight mb-4">
              {getVal("about_us", "heading", "Responsible, Sustainable, Exceptional.")}
            </h2>
            <p className="text-foreground leading-relaxed mb-6">
              {getVal("about_us", "body", "Our mission is to support the placement of as many rescue dogs as possible into loving homes through wine sales and donations. Our business is producing fine wines; our passion is helping rescue dogs.")}
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10"
            >
              <Link to="/about">Learn About Our Mission</Link>
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
                src="https://rescuedogwines.com/wp-content/uploads/2023/12/lodi-sustainable-winegrowing.png"
                alt="Lodi Rules Sustainable Winegrowing certification"
                className="max-w-[250px] w-full h-auto"
              />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                {getVal("lodi", "heading", "Lodi Rules Certified Green")}
              </h2>
              <p className="text-foreground leading-relaxed mb-6">
                {getVal("lodi", "body", "Our grapes are grown under one of the most rigorous third-party sustainability certifications in the wine industry, ensuring every bottle is as responsible as it is delicious.")}
              </p>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="uppercase tracking-brand text-sm font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-10"
              >
                <Link to="/vineyard">Learn About Our Vineyard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Ambassador Program callout */}
      <section className="py-14 bg-foreground text-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <p className="text-xs tracking-brand uppercase opacity-70 mb-2">Affiliate Program · Powered by impact.com</p>
          <h2 className="text-2xl md:text-3xl font-bold uppercase mb-4">Turn Your Love for Rescue Dogs into Commission</h2>
          <p className="opacity-90 max-w-2xl mx-auto mb-6 text-sm md:text-base">
            Nonprofits, enthusiasts, and influencers earn percentage-based commission on every bottle sold through their personal link — automatic tracking, automatic payments, no contractor paperwork on your end.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" variant="secondary" className="uppercase tracking-brand">
              <Link to="/ambassadors">Become an Ambassador</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent border-background text-background hover:bg-background hover:text-foreground uppercase tracking-brand">
              <Link to="/ambassadors/find">Find an Ambassador</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Events Preview */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-bold text-foreground">Events</h2>
            <Link to="/events" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
              View More Events <ArrowRight className="h-4 w-4" />
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
              Follow Us on Instagram
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
            <p className="text-primary-foreground/80 text-sm uppercase tracking-brand font-bold mb-2">Join Our</p>
            <h2 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4">
              {getVal("club_cta", "heading", "Club")}
            </h2>
            <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto mb-4">
              {getVal("club_cta", "body", "Get 20% off wine purchases! Join us in our commitment to support animal rescue organizations and receive regular shipments of award-winning wines — plus perks!")}
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 uppercase tracking-brand text-sm font-bold px-10 py-6"
            >
              <Link to="/club">Learn More & Join</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Merch Section */}
      {merch.length > 0 && (
        <section className="py-16 bg-secondary">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-10">
              <h2 className="text-2xl font-bold text-foreground">Merch & Accessories</h2>
              <Link to="/merch" className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 uppercase tracking-brand">
                View All <ArrowRight className="h-4 w-4" />
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

      {showImpact && <ImpactCounter />}

      {/* Wholesale CTA */}
      <section className="py-12 border-t border-border">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-bold text-foreground text-sm uppercase tracking-brand">Trade & Media</p>
              <p className="text-sm text-muted-foreground">Interested in carrying our wines? Let's talk.</p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="uppercase tracking-brand text-xs font-bold border-foreground text-foreground hover:bg-foreground hover:text-background px-8"
          >
            <Link to="/wholesale">Learn More</Link>
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
