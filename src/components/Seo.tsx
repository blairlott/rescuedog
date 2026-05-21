import { Helmet } from "react-helmet-async";
import { breadcrumbListSchema } from "@/lib/jsonLd";

interface Props {
  title: string;
  description?: string;
  image?: string;
  path?: string;
  noindex?: boolean;
  jsonLd?: Record<string, any> | Record<string, any>[];
  /** Auto-emits a BreadcrumbList JSON-LD alongside jsonLd. URLs are resolved against the site origin. */
  breadcrumbs?: Array<{ name: string; path: string }>;
  /** LCP image URL to preload with high priority. Pass the same asset used for the hero. */
  preloadImage?: string;
  preloadImageType?: string; // e.g. "image/webp"
}

const SITE = "https://rescuedogwines.com";
const DEFAULT_DESC = "Award-winning, sustainable wines from Lodi. 50% of profits support animal rescue.";
const DEFAULT_IMG = `${SITE}/og-default.jpg`;

export function Seo({ title, description = DEFAULT_DESC, image = DEFAULT_IMG, path, noindex, jsonLd, breadcrumbs, preloadImage, preloadImageType }: Props) {
  const url = path ? `${SITE}${path}` : SITE;
  const fullTitle = title.endsWith("Rescue Dog Wines") ? title : `${title} | Rescue Dog Wines`;
  const schemas: Record<string, any>[] = [];
  if (jsonLd) schemas.push(...(Array.isArray(jsonLd) ? jsonLd : [jsonLd]));
  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push(
      breadcrumbListSchema(breadcrumbs.map((b) => ({ name: b.name, url: `${SITE}${b.path}` }))),
    );
  }
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      {preloadImage && (
        <link rel="preload" as="image" href={preloadImage} {...(preloadImageType ? { type: preloadImageType } : {})} fetchPriority="high" />
      )}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  );
}