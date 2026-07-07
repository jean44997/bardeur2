import { Helmet } from "react-helmet-async";

type Props = {
  title: string;
  description: string;
  path: string; // e.g. "/explore"
  image?: string; // absolute URL
  type?: "website" | "article" | "profile";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

const SITE = "https://bardeur2.lovable.app";
const DEFAULT_IMG = `${SITE}/app-icon-512.png`;

export default function SeoHead({ title, description, path, image, type = "website", jsonLd }: Props) {
  const url = `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
  const img = image || DEFAULT_IMG;
  const schemas = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={img} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(s)}</script>
      ))}
    </Helmet>
  );
}
