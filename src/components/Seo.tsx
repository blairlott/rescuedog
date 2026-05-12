import { Helmet } from "react-helmet-async";

interface Props {
  title: string;
  description?: string;
  image?: string;
  path?: string;
  noindex?: boolean;
  jsonLd?: Record<string, any>;
}

const SITE = "https://rescuedogwines.com";
const DEFAULT_DESC = "Award-winning, sustainable wines from Lodi. 50% of profits support animal rescue.";
const DEFAULT_IMG = "https://rescuedogwines.com/wp-content/uploads/2023/09/rescue-dog-wines-1.jpg";

export function Seo({ title, description = DEFAULT_DESC, image = DEFAULT_IMG, path, noindex, jsonLd }: Props) {
  const url = path ? `${SITE}${path}` : SITE;
  const fullTitle = title.endsWith("Rescue Dog Wines") ? title : `${title} | Rescue Dog Wines`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}