import { CmsPageView, pageMetadata } from '@/lib/page';
import { cms } from '@/lib/cms';

export const revalidate = 300;
export const generateMetadata = () => pageMetadata('home', '/');

/** LocalBusiness structured data from the CMS site config (helps search results and maps). */
async function LocalBusinessJsonLd() {
  const c = (await cms.site())?.config;
  if (!c) return null;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LandscapingBusiness',
    name: c.companyName,
    url: process.env.WEB_URL ?? 'http://localhost:3000',
    telephone: c.phone,
    email: c.email,
    address: { '@type': 'PostalAddress', streetAddress: 'Tian Suy Go, San Jose', addressLocality: 'Puerto Princesa City', addressRegion: 'Palawan', postalCode: '5300', addressCountry: 'PH' },
    areaServed: 'Palawan',
    sameAs: [c.socials.facebook, c.socials.instagram].filter(Boolean),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export default function Home() {
  return <CmsPageView slug="home" after={<LocalBusinessJsonLd />} />;
}
