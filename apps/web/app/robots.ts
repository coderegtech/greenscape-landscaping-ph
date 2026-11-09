import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.WEB_URL ?? 'http://localhost:3000';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/account', '/api/', '/auth/', '/design', '/login', '/signup', '/forgot-password', '/reset-password'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
