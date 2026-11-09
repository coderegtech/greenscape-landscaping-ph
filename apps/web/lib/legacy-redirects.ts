// Permanent redirects from the current site's URLs (docs/audit/routes.md) to the rebuild.
// Each legacy page is matched with and without `.html`, `/index.html` and a trailing slash, so one hop lands.
type Redirect = { source: string; destination: string; statusCode: 301 };

const map: [string, string][] = [
  ['/index.html', '/'],
  ['/pages', '/'],
  ['/pages/about-greenscape', '/about'],
  ['/pages/our-story', '/stories'],
  ['/pages/gallery', '/gallery'],
  ['/pages/services/garden-design', '/services/garden-design'],
  ['/pages/services/garden-essential', '/services/garden-essentials'],
  ['/pages/services/landscaping', '/services/landscaping'],
  ['/pages/services/garden-maintenance', '/services/garden-maintenance'],
  ['/pages/projects/residential-garden', '/projects?category=residential-garden'],
  ['/pages/projects/commercial-landscaping', '/projects?category=commercial-landscaping'],
  ['/pages/projects/indoor-landscaping', '/projects?category=indoor-landscaping'],
  ['/pages/projects/landscape-rehabilitation', '/projects?category=landscape-rehabilitation'],
  ['/pages/contact', '/contact'],
  ['/pages/contact/faq', '/faq'],
  ['/pages/contact/client-feedback', '/testimonials#share'],
  ['/pages/testimonials', '/testimonials'],
  ['/pages/get-a-quote', '/quote'],
  ['/pages/delivery-policy', '/delivery-policy'],
  ['/pages/privacy-policy', '/privacy'],
  // /pages/services/products/* (catalogue and product-detail?id=) are mapped with the shop in Phase 8.
];

export const legacyRedirects: Redirect[] = map.flatMap(([from, to]) =>
  (from === '/index.html' ? [from] : [from, `${from}/`, `${from}.html`, `${from}/index.html`]).map((source) => ({ source, destination: to, statusCode: 301 as const })),
);

/** Story pages used Firestore ids in the query string; the proxy resolves them to slugs. */
export const LEGACY_STORY_PATHS = new Set(['/pages/our-story/story.html', '/pages/our-story/story', '/share/story']);
