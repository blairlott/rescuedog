/**
 * JSON-LD helpers for SEO. Render the returned object inside a
 * <script type="application/ld+json"> tag — typically via the <Seo />
 * component or a small inline helper on the page.
 */

interface ProductSchemaInput {
  name: string;
  description?: string;
  image?: string;
  sku?: string;
  brand?: string;
  priceUSD: number;
  url: string;
  inStock?: boolean;
  rating?: { value: number; count: number } | null;
}

export function productSchema(p: ProductSchemaInput) {
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: p.name,
    description: p.description,
    image: p.image ? [p.image] : undefined,
    sku: p.sku,
    brand: { "@type": "Brand", name: p.brand ?? "Rescue Dog Wines" },
    offers: {
      "@type": "Offer",
      url: p.url,
      priceCurrency: "USD",
      price: p.priceUSD.toFixed(2),
      availability: p.inStock === false
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
    },
  };
  if (p.rating && p.rating.count > 0) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: p.rating.value.toFixed(1),
      reviewCount: p.rating.count,
    };
  }
  return obj;
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Rescue Dog Wines",
    url: typeof window !== "undefined" ? window.location.origin : "https://rescuedogwines.com",
    logo: "/rdw-logo.png",
    sameAs: [
      "https://www.instagram.com/rescuedogwines",
      "https://www.facebook.com/rescuedogwines",
    ],
  };
}

export function faqPageSchema(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbListSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function winerySchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Winery",
    name: "Rescue Dog Wines",
    url: "https://rescuedogwines.com",
    logo: "https://rescuedogwines.com/rdw-logo.png",
    description:
      "Family-owned, sustainably-farmed Lodi, California winery. A portion of every bottle helps rescue dogs find their forever home.",
    address: {
      "@type": "PostalAddress",
      addressRegion: "CA",
      addressCountry: "US",
      addressLocality: "Lodi",
    },
    areaServed: "US",
    sameAs: [
      "https://www.instagram.com/rescuedogwines",
      "https://www.facebook.com/rescuedogwines",
    ],
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}