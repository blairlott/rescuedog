/**
 * Simulation dataset shaped exactly like WordPress REST API responses.
 * Lets us build the WP-driven site today; flip WP_SIMULATION = false later.
 * Keys mirror /wp-json/wp/v2/ payloads (id, slug, title.rendered, content.rendered, etc.)
 */
export interface WpRendered { rendered: string }
export interface WpPage {
  id: number;
  slug: string;
  title: WpRendered;
  content: WpRendered;
  acf?: Record<string, unknown>;
  modified: string;
}
export interface WpPost extends WpPage {
  excerpt: WpRendered;
  date: string;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url: string; alt_text: string }>;
    author?: Array<{ name: string }>;
  };
}
export interface WpWine extends WpPage {
  acf: {
    sku: string;
    tasting_notes: string;
    food_pairing: string;
    awards: string[];
    vintage: number;
  };
}

const now = "2026-05-10T00:00:00Z";

export const MOCK_PAGES: WpPage[] = [
  {
    id: 1, slug: "home", modified: now,
    title: { rendered: "Rescue Dog Wines" },
    content: { rendered: "<p>Award-winning Georgia wines that rescue dogs.</p>" },
    acf: { hero_headline: "Wines that rescue dogs.", hero_sub: "Every bottle gives back." },
  },
  {
    id: 2, slug: "about", modified: now,
    title: { rendered: "Our Story" },
    content: { rendered: "<p>Founded by dog lovers in Dahlonega, GA…</p>" },
  },
  {
    id: 3, slug: "mission", modified: now,
    title: { rendered: "Mission" },
    content: { rendered: "<p>50% of profits fund 501(c)(3) rescue partners nationwide.</p>" },
  },
  {
    id: 4, slug: "vineyard", modified: now,
    title: { rendered: "The Vineyard" },
    content: { rendered: "<p>Our estate sits in the foothills of the Blue Ridge.</p>" },
  },
  {
    id: 5, slug: "events", modified: now,
    title: { rendered: "Events" },
    content: { rendered: "<p>Tastings, pairings, and adoption days.</p>" },
  },
];

export const MOCK_POSTS: WpPost[] = [
  {
    id: 101, slug: "double-gold-2026", modified: now, date: now,
    title: { rendered: "Our Cabernet just took Double Gold" },
    excerpt: { rendered: "<p>Big news from the SF International Wine Competition…</p>" },
    content: { rendered: "<p>Full story coming soon.</p>" },
    _embedded: { author: [{ name: "RDW Team" }] },
  },
  {
    id: 102, slug: "spring-rescue-roundup", modified: now, date: now,
    title: { rendered: "Spring Rescue Roundup" },
    excerpt: { rendered: "<p>16 dogs adopted at our April tasting.</p>" },
    content: { rendered: "<p>Thank you to everyone who came out…</p>" },
    _embedded: { author: [{ name: "Sasha" }] },
  },
];

export const MOCK_WINES: WpWine[] = [
  {
    id: 201, slug: "rdw-cab-2022", modified: now,
    title: { rendered: "Rescue Dog Cabernet 2022" },
    content: { rendered: "<p>Bold, structured, food-friendly.</p>" },
    acf: {
      sku: "RDW-CAB-2022",
      tasting_notes: "Black cherry, cedar, soft tannins, long finish.",
      food_pairing: "Ribeye, lamb chops, aged cheddar.",
      awards: ["Double Gold — SFIWC 2026", "92pts — Wine Enthusiast"],
      vintage: 2022,
    },
  },
];