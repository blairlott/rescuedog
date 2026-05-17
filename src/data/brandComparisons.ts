export interface BrandComparison {
  slug: string;
  competitor: string;
  competitorTagline: string;
  pricePoint: string;
  category: string;
  hero: {
    eyebrow: string;
    headline: string;
    sub: string;
  };
  /** Keyword cluster this page targets — used in copy and meta. */
  keywords: string[];
  /** SEO title under 60 chars and description under 160 chars. */
  seoTitle: string;
  seoDescription: string;
  /** Side-by-side spec rows. */
  specs: Array<{ attribute: string; rdw: string; them: string; advantageRdw?: boolean }>;
  /** "Why switch" reasons. */
  reasons: Array<{ title: string; body: string }>;
  faqs: Array<{ question: string; answer: string }>;
  /** Optional disclosure line shown under the table. */
  disclosure?: string;
  /** Citations for competitor facts referenced on the page. */
  sources?: Array<{ label: string; url: string; publisher?: string }>;
}

const COMMON_DISCLOSURE =
  "Comparison reflects publicly available information about each brand at time of publishing. Rescue Dog Wines is not affiliated with, endorsed by, or sponsored by the brands referenced.";

export const BRAND_COMPARISONS: BrandComparison[] = [
  {
    slug: "meiomi",
    competitor: "Meiomi",
    competitorTagline: "Premium California blend, ~$20/bottle",
    pricePoint: "$18–$24",
    category: "Pinot Noir / Cabernet alternatives",
    keywords: [
      "wines like Meiomi",
      "Meiomi alternative",
      "Meiomi Pinot Noir alternative",
      "premium California red wine under $25",
      "charity wine like Meiomi",
    ],
    seoTitle: "Wines Like Meiomi — Lodi Alternative That Gives Back",
    seoDescription:
      "Looking for a Meiomi alternative? Rescue Dog Wines: small-batch Lodi reds at the same price point, sustainably farmed, with 50% of profits to dog rescue.",
    hero: {
      eyebrow: "Meiomi alternative",
      headline: "Love Meiomi? You'll love what we built next.",
      sub: "Rescue Dog Wines delivers the same lush, fruit-forward California red profile Meiomi fans crave — small-batch, sustainably farmed in Lodi, and 50% of profits go to dog rescue. Same shelf price. Bigger mission.",
    },
    specs: [
      { attribute: "Origin", rdw: "Lodi, CA (single appellation)", them: "Multi-AVA blend (CA)", advantageRdw: true },
      { attribute: "Production scale", rdw: "Small-batch craft", them: "Mass-produced (millions of cases)", advantageRdw: true },
      { attribute: "Owned by", rdw: "Independent rescue-mission winery", them: "Constellation Brands (since 2016)" },
      { attribute: "Sustainability", rdw: "Lodi Rules certified region", them: "Not certified sustainable", advantageRdw: true },
      { attribute: "Profit to charity", rdw: "50% of profits to dog rescue", them: "No structured giveback", advantageRdw: true },
      { attribute: "Price range", rdw: "$18–$28", them: "$18–$24" },
      { attribute: "Wine Club benefit", rdw: "20% off + member-only releases", them: "No DTC club" },
    ],
    reasons: [
      {
        title: "The same lush California red — without the corporate ownership.",
        body: "Meiomi was acquired by Constellation Brands in 2016 for $315M. Rescue Dog Wines is independently owned, small-batch, and built around a single mission: funding dog rescue.",
      },
      {
        title: "Lodi outperforms the blend.",
        body: "Meiomi sources from multiple AVAs. We farm a single Lodi appellation — one of California's most sustainability-certified wine regions — for tighter, more expressive fruit.",
      },
      {
        title: "Your bottle changes a dog's life.",
        body: "Buying Meiomi funds a parent corporation. Buying Rescue Dog Wines funds vetted 501(c)(3) rescue partners — half the profit, every bottle, every time.",
      },
    ],
    faqs: [
      {
        question: "What wines are similar to Meiomi?",
        answer:
          "Rescue Dog Wines is the closest charity-driven analog to Meiomi at a similar price point — fruit-forward California reds with a smooth, modern profile. Other comparable bottles include Belle Glos, Bread & Butter, and Educated Guess, but none reinvest profits into a rescue mission.",
      },
      {
        question: "Is Rescue Dog Wines cheaper than Meiomi?",
        answer:
          "Our wines start at a comparable price to Meiomi (~$18–$28). Wine Club members get 20% off every order, which puts member pricing meaningfully below Meiomi retail.",
      },
      {
        question: "Does Meiomi donate to charity?",
        answer:
          "Meiomi runs occasional cause-marketing campaigns but does not have a structured profit-share giveback. Rescue Dog Wines commits 50% of profits to 501(c)(3) dog-rescue partners on every bottle.",
      },
    ],
    disclosure: COMMON_DISCLOSURE,
    sources: [
      {
        label: "Constellation Brands acquires Meiomi for $315M (2015)",
        publisher: "Reuters",
        url: "https://www.reuters.com/article/us-meiomi-m-a-constellation-brands-idUSKCN0PJ1VC20150709",
      },
      {
        label: "Meiomi brand overview & AVA sourcing",
        publisher: "Meiomi Wines (official)",
        url: "https://www.meiomi.com/our-wines",
      },
      {
        label: "Lodi Rules — Certified Sustainable Winegrowing",
        publisher: "Lodi Winegrape Commission",
        url: "https://www.lodirules.com/",
      },
    ],
  },
  {
    slug: "justin",
    competitor: "Justin",
    competitorTagline: "Paso Robles Cabernet, ~$26/bottle",
    pricePoint: "$22–$30",
    category: "Cabernet Sauvignon alternatives",
    keywords: [
      "wines like Justin Cabernet",
      "Justin Cabernet alternative",
      "Paso Robles Cabernet alternative",
      "premium Cabernet under $30",
      "charity Cabernet Sauvignon",
    ],
    seoTitle: "Wines Like Justin Cabernet — Mission-Driven Alternative",
    seoDescription:
      "Justin Cabernet alternative from Lodi. Same premium California Cab profile, independently owned, with 50% of profits supporting 501(c)(3) dog rescue partners.",
    hero: {
      eyebrow: "Justin Cabernet alternative",
      headline: "Premium California Cab. Without the corporate parent.",
      sub: "Justin built its reputation on bold Paso Robles Cabernet. We farm a different — and arguably more sustainability-focused — appellation in Lodi, with the same structured, age-worthy profile. And 50% of every bottle's profit goes to dog rescue.",
    },
    specs: [
      { attribute: "Origin", rdw: "Lodi, CA", them: "Paso Robles, CA" },
      { attribute: "Production scale", rdw: "Small-batch craft", them: "Large-scale production", advantageRdw: true },
      { attribute: "Owned by", rdw: "Independent rescue-mission winery", them: "The Wonderful Company", advantageRdw: true },
      { attribute: "Sustainability", rdw: "Lodi Rules certified region", them: "SIP Certified (some vineyards)" },
      { attribute: "Profit to charity", rdw: "50% of profits to dog rescue", them: "No structured giveback", advantageRdw: true },
      { attribute: "Price range", rdw: "$22–$30 (member pricing 20% off)", them: "$26–$80+" },
      { attribute: "Award recognition", rdw: "Medal-winning at major US competitions", them: "Wine Spectator Top 100 history" },
    ],
    reasons: [
      {
        title: "A Cab that rivals Paso — at independent winery scale.",
        body: "Justin is owned by The Wonderful Company (Fiji Water, POM, Halos). We're a single-mission winery: every dollar of profit either funds the next vintage or funds a rescue partner.",
      },
      {
        title: "Lodi over Paso — for sustainability.",
        body: "Lodi is home to the most sustainability-certified vineyard acreage in California. We farm to Lodi Rules standards, which audit water use, soil health, and labor practices.",
      },
      {
        title: "Half the profit. All the dogs.",
        body: "Buy a Justin Cab and you're supporting a holding company. Buy a Rescue Dog Cab and 50% of profit funds vetted 501(c)(3) rescue partners.",
      },
    ],
    faqs: [
      {
        question: "What's a good alternative to Justin Cabernet?",
        answer:
          "Rescue Dog Wines' Lodi Cabernet is the closest mission-driven alternative at a comparable price point. Other Justin-style Cabs include Daou, Austin Hope, and Hess Select — but none route 50% of profits to charity.",
      },
      {
        question: "Is Lodi Cabernet as good as Paso Robles?",
        answer:
          "Lodi produces some of California's most awarded Cabernet at a more accessible price point. The region's older vines and Mediterranean climate yield Cabs with the same structure and dark-fruit profile Justin fans love.",
      },
      {
        question: "Who owns Justin Vineyards?",
        answer:
          "Justin Vineyards is owned by The Wonderful Company. Rescue Dog Wines is independently owned and operated, with a charter to direct 50% of profits to 501(c)(3) dog-rescue partners.",
      },
    ],
    disclosure: COMMON_DISCLOSURE,
    sources: [
      {
        label: "Justin Vineyards owned by The Wonderful Company",
        publisher: "The Wonderful Company (official)",
        url: "https://www.wonderful.com/our-companies",
      },
      {
        label: "SIP Certified sustainability standard",
        publisher: "Sustainability in Practice (SIP Certified)",
        url: "https://www.sipcertified.org/",
      },
      {
        label: "Justin Isosceles — Wine Spectator Top 100 (1999, #6)",
        publisher: "Wine Spectator",
        url: "https://top100.winespectator.com/wines/year/1999/",
      },
      {
        label: "Lodi: most sustainably-certified wine region in the U.S.",
        publisher: "Lodi Winegrape Commission",
        url: "https://www.lodiwine.com/lodi-rules",
      },
    ],
  },
  {
    slug: "barefoot",
    competitor: "Barefoot",
    competitorTagline: "Entry-level California wine, ~$7/bottle",
    pricePoint: "Upgrade tier ($18+)",
    category: "Entry-level upgrade",
    keywords: [
      "Barefoot wine alternative",
      "premium upgrade from Barefoot",
      "better wine than Barefoot",
      "charity wine under $25",
      "small batch alternative to Barefoot",
    ],
    seoTitle: "Upgrade from Barefoot — Charity Wine, Real Vintage",
    seoDescription:
      "Ready to upgrade from Barefoot? Rescue Dog Wines: small-batch, sustainably farmed Lodi wines from $18, with 50% of profits to 501(c)(3) dog rescue.",
    hero: {
      eyebrow: "Upgrade from Barefoot",
      headline: "Trade the value brand for the value mission.",
      sub: "Barefoot is America's best-selling wine — and that's the point: it's mass-produced for shelf scale. When you're ready for small-batch, single-appellation wines that actually fund a cause, this is the next step up.",
    },
    specs: [
      { attribute: "Origin", rdw: "Lodi, CA (single appellation)", them: "Multi-source California blend" },
      { attribute: "Production scale", rdw: "Small-batch craft", them: "Tens of millions of cases/yr" },
      { attribute: "Owned by", rdw: "Independent rescue-mission winery", them: "E. & J. Gallo Winery" },
      { attribute: "Vintage-dated", rdw: "Yes — every bottle", them: "Non-vintage on most SKUs", advantageRdw: true },
      { attribute: "Profit to charity", rdw: "50% of profits to dog rescue", them: "CSR campaigns only", advantageRdw: true },
      { attribute: "Price range", rdw: "$18–$30", them: "$5–$8" },
      { attribute: "Best for", rdw: "The next bottle up — gifting, weeknight upgrade", them: "Volume buying" },
    ],
    reasons: [
      {
        title: "A real step up — without leaving the dog rescue mission behind.",
        body: "Barefoot is owned by Gallo, the largest wine company in the world. Rescue Dog Wines is independent and built around one purpose: funding 501(c)(3) dog rescue partners.",
      },
      {
        title: "Vintage-dated. Single appellation. Actually farmed.",
        body: "Barefoot's strength is consistency at scale. Ours is craft: vintage-dated, single-appellation Lodi wines made in batches small enough to taste the season.",
      },
      {
        title: "Same dog person. Bigger impact.",
        body: "Barefoot supports occasional charitable campaigns. We direct 50% of profits to vetted 501(c)(3) rescues — every bottle, every order, every month.",
      },
    ],
    faqs: [
      {
        question: "Is Rescue Dog Wines a premium upgrade from Barefoot?",
        answer:
          "Yes. Our entry-level Lodi wines start around $18 and are vintage-dated, single-appellation, and small-batch — the next clear step up from supermarket value brands like Barefoot.",
      },
      {
        question: "Does Barefoot donate to dog rescue?",
        answer:
          "Barefoot runs occasional cause-marketing campaigns but does not have a structured profit-share for animal rescue. Rescue Dog Wines commits 50% of profits to 501(c)(3) dog-rescue partners on every bottle.",
      },
      {
        question: "What's the best wine for dog lovers?",
        answer:
          "Rescue Dog Wines is built specifically for dog lovers: 50% of profits fund 501(c)(3) rescues, every bottle features a rescue story, and our Wine Club ('The Pack') compounds that funding through recurring shipments.",
      },
    ],
    disclosure: COMMON_DISCLOSURE,
    sources: [
      {
        label: "Barefoot Cellars owned by E. & J. Gallo Winery",
        publisher: "E. & J. Gallo Winery (official brand list)",
        url: "https://www.gallo.com/our-brands/",
      },
      {
        label: "Barefoot — top-selling U.S. wine brand by volume",
        publisher: "Wine Business / Impact Databank rankings",
        url: "https://www.winebusiness.com/news/article/268140",
      },
      {
        label: "Barefoot non-vintage labeling (product detail)",
        publisher: "Barefoot Wine (official)",
        url: "https://www.barefootwine.com/our-wines",
      },
    ],
  },
  {
    slug: "kendall-jackson",
    competitor: "Kendall-Jackson",
    competitorTagline: "Best-selling California Chardonnay, ~$18/bottle",
    pricePoint: "$18–$28",
    category: "Chardonnay & Cabernet alternatives",
    keywords: [
      "wines like Kendall-Jackson",
      "Kendall-Jackson alternative",
      "Kendall-Jackson Vintner's Reserve alternative",
      "California Chardonnay charity wine",
      "small batch alternative to Kendall-Jackson",
    ],
    seoTitle: "Wines Like Kendall-Jackson — Charity Lodi Alternative",
    seoDescription:
      "Kendall-Jackson alternative from Lodi. Same approachable California profile, small-batch and independently owned, with 50% of profits to 501(c)(3) dog rescue.",
    hero: {
      eyebrow: "Kendall-Jackson alternative",
      headline: "America's Chardonnay, reimagined for dog people.",
      sub: "Kendall-Jackson's Vintner's Reserve has been America's #1 Chardonnay for decades — built on multi-county California blends. Rescue Dog Wines delivers the same approachable, food-friendly profile at single-appellation Lodi scale, with 50% of every bottle's profit going to dog rescue.",
    },
    specs: [
      { attribute: "Origin", rdw: "Lodi, CA (single appellation)", them: "Multi-county California blend", advantageRdw: true },
      { attribute: "Production scale", rdw: "Small-batch craft", them: "Millions of cases/yr", advantageRdw: true },
      { attribute: "Owned by", rdw: "Independent rescue-mission winery", them: "Jackson Family Wines" },
      { attribute: "Sustainability", rdw: "Lodi Rules certified region", them: "Certified California Sustainable Winegrowing" },
      { attribute: "Profit to charity", rdw: "50% of profits to dog rescue", them: "No structured profit-share giveback", advantageRdw: true },
      { attribute: "Price range", rdw: "$18–$28 (member pricing 20% off)", them: "$15–$22" },
      { attribute: "Wine Club benefit", rdw: "20% off + member-only releases", them: "Estate club, no DTC giveback" },
    ],
    reasons: [
      {
        title: "America's Chardonnay profile — at independent winery scale.",
        body: "Kendall-Jackson is the flagship of Jackson Family Wines, with over 40 brands and millions of cases. We're one winery, one mission: small-batch Lodi wines that fund dog rescue.",
      },
      {
        title: "Single-appellation Lodi over multi-county blends.",
        body: "Vintner's Reserve is built from grapes across multiple California counties. We farm a single Lodi appellation for tighter expression and a smaller footprint.",
      },
      {
        title: "Every bottle funds a rescue partner.",
        body: "Buying Kendall-Jackson supports a family wine portfolio. Buying Rescue Dog Wines routes 50% of profits to vetted 501(c)(3) rescue partners — every bottle, every order.",
      },
    ],
    faqs: [
      {
        question: "What wines are similar to Kendall-Jackson Vintner's Reserve?",
        answer:
          "Rescue Dog Wines' Lodi Chardonnay sits in the same approachable, oak-touched California style as Vintner's Reserve at a similar price point. Other comparable bottles include La Crema, Cambria, and Sonoma-Cutrer — but none route 50% of profits to dog rescue.",
      },
      {
        question: "Who owns Kendall-Jackson?",
        answer:
          "Kendall-Jackson is owned by Jackson Family Wines, a private family wine company with more than 40 brands worldwide. Rescue Dog Wines is independently owned with a charter to direct 50% of profits to 501(c)(3) dog-rescue partners.",
      },
      {
        question: "Does Kendall-Jackson donate to charity?",
        answer:
          "Jackson Family Wines runs corporate sustainability and community programs, but Kendall-Jackson does not operate a structured per-bottle profit-share giveback. Rescue Dog Wines commits 50% of profits to dog rescue on every bottle.",
      },
    ],
    disclosure: COMMON_DISCLOSURE,
    sources: [
      {
        label: "Kendall-Jackson is owned by Jackson Family Wines",
        publisher: "Jackson Family Wines (official)",
        url: "https://www.jacksonfamilywines.com/our-wines",
      },
      {
        label: "Vintner's Reserve Chardonnay — best-selling Chardonnay in the U.S.",
        publisher: "Kendall-Jackson (official)",
        url: "https://www.kj.com/wine/vintners-reserve-chardonnay",
      },
      {
        label: "Certified California Sustainable Winegrowing program",
        publisher: "California Sustainable Winegrowing Alliance",
        url: "https://www.sustainablewinegrowing.org/certified-sustainable-winegrowing.php",
      },
      {
        label: "Lodi Rules — Certified Sustainable Winegrowing",
        publisher: "Lodi Winegrape Commission",
        url: "https://www.lodirules.com/",
      },
    ],
  },
  {
    slug: "decoy",
    competitor: "Decoy by Duckhorn",
    competitorTagline: "Approachable Duckhorn label, ~$25/bottle",
    pricePoint: "$25–$35",
    category: "Premium California red & white alternatives",
    keywords: [
      "Decoy by Duckhorn alternative",
      "wines like Decoy",
      "Duckhorn Decoy alternative",
      "premium California Cabernet under $35",
      "charity wine like Decoy",
    ],
    seoTitle: "Wines Like Decoy by Duckhorn — Lodi Charity Alternative",
    seoDescription:
      "Decoy by Duckhorn alternative from Lodi. Same premium California red profile, independently owned, with 50% of profits supporting 501(c)(3) dog rescue partners.",
    hero: {
      eyebrow: "Decoy alternative",
      headline: "Premium California reds — independently owned, dog-driven.",
      sub: "Decoy is Duckhorn's approachable, food-friendly tier — a popular step-up bottle in the $25–$35 range. Rescue Dog Wines delivers the same premium California profile, single-appellation in Lodi, with 50% of every bottle's profit going to dog rescue.",
    },
    specs: [
      { attribute: "Origin", rdw: "Lodi, CA (single appellation)", them: "Multi-AVA California sourcing", advantageRdw: true },
      { attribute: "Production scale", rdw: "Small-batch craft", them: "Large-scale premium production" },
      { attribute: "Owned by", rdw: "Independent rescue-mission winery", them: "The Duckhorn Portfolio (acquired by Butterfly Equity, 2024)" },
      { attribute: "Sustainability", rdw: "Lodi Rules certified region", them: "Napa Green / CCSW participation across portfolio" },
      { attribute: "Profit to charity", rdw: "50% of profits to dog rescue", them: "No structured profit-share giveback", advantageRdw: true },
      { attribute: "Price range", rdw: "$22–$35 (member pricing 20% off)", them: "$22–$35" },
      { attribute: "Wine Club benefit", rdw: "20% off + member-only releases", them: "Duckhorn DTC club, no charitable share" },
    ],
    reasons: [
      {
        title: "The same premium tier — without the private-equity parent.",
        body: "Duckhorn (Decoy's parent) was taken private by Butterfly Equity in 2024 in a deal valued near $2B. Rescue Dog Wines is independently owned and routes profit to rescue, not a fund.",
      },
      {
        title: "Lodi over multi-AVA blending.",
        body: "Decoy is built from grapes sourced across multiple California AVAs for scale. We farm a single Lodi appellation — one of the most sustainability-certified regions in California — for tighter expression.",
      },
      {
        title: "Half the profit. All the dogs.",
        body: "Buying Decoy supports a premium-wine portfolio held by a private-equity firm. Buying Rescue Dog Wines routes 50% of profits to vetted 501(c)(3) dog-rescue partners — every bottle, every order.",
      },
    ],
    faqs: [
      {
        question: "What wines are similar to Decoy by Duckhorn?",
        answer:
          "Rescue Dog Wines' Lodi reds sit in the same approachable-premium tier as Decoy at a comparable price point. Other Decoy-style alternatives include Frei Brothers, Hess Select, and Hahn SLH — but none route 50% of profits to dog rescue.",
      },
      {
        question: "Who owns Decoy?",
        answer:
          "Decoy is part of The Duckhorn Portfolio, which was acquired by private-equity firm Butterfly Equity in 2024 and taken private. Rescue Dog Wines is independently owned with a charter to direct 50% of profits to 501(c)(3) dog-rescue partners.",
      },
      {
        question: "Does Duckhorn or Decoy donate to charity?",
        answer:
          "The Duckhorn Portfolio supports community and sustainability programs, but Decoy does not operate a structured per-bottle profit-share giveback. Rescue Dog Wines commits 50% of profits to dog rescue on every bottle.",
      },
    ],
    disclosure: COMMON_DISCLOSURE,
    sources: [
      {
        label: "Butterfly Equity to acquire The Duckhorn Portfolio (2024)",
        publisher: "Reuters",
        url: "https://www.reuters.com/markets/deals/butterfly-equity-buy-wine-maker-duckhorn-19-bln-deal-2024-10-07/",
      },
      {
        label: "Decoy brand overview & sourcing",
        publisher: "Duckhorn Portfolio (official)",
        url: "https://www.decoywines.com/our-wines",
      },
      {
        label: "Lodi Rules — Certified Sustainable Winegrowing",
        publisher: "Lodi Winegrape Commission",
        url: "https://www.lodirules.com/",
      },
    ],
  },
];

export function getBrandComparison(slug: string): BrandComparison | undefined {
  return BRAND_COMPARISONS.find((b) => b.slug === slug);
}