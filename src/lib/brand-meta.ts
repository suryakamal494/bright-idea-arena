const BRAND = "ICORG";
const EVENT = "Social Innovation Ideathon";
const SHARE_IMAGE = "https://bright-idea-arena.lovable.app/icorg-social-innovation-preview.jpg";

type PageMetaOptions = { shareImage?: boolean };
type PageMetaEntry =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export function createPageHead(title: string, description: string, options: PageMetaOptions = {}) {
  const pageTitle = title === EVENT ? `${EVENT} | ${BRAND}` : `${title} | ${EVENT} | ${BRAND}`;
  const meta: PageMetaEntry[] = [
    { title: pageTitle },
    { name: "description", content: description },
    { property: "og:title", content: pageTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: options.shareImage ? "summary_large_image" : "summary" },
  ];

  if (options.shareImage) {
    meta.push({ property: "og:image", content: SHARE_IMAGE });
    meta.push({ name: "twitter:image", content: SHARE_IMAGE });
  }

  return { meta };
}