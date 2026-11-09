import type { MetadataRoute } from 'next';
import { cms } from '@/lib/cms';

export const revalidate = 3600;

/** Generated from the CMS, so new services, projects and stories appear without code changes. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.WEB_URL ?? 'http://localhost:3000';
  const [services, projects, stories, guides] = await Promise.all([
    cms.services(),
    cms.projects({ limit: 100 }),
    cms.articles({ topic: 'story', limit: 100 }),
    cms.articles({ topic: 'garden-essentials', limit: 100 }),
  ]);
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'monthly') => ({ url: `${base}${path}`, priority, changeFrequency });
  return [
    page('/', 1, 'weekly'),
    page('/services', 0.9),
    ...services.map((s) => page(`/services/${s.slug}`, 0.9)),
    page('/projects', 0.8, 'weekly'),
    ...projects.map((p) => page(`/projects/${p.slug}`, 0.7)),
    page('/stories', 0.6, 'weekly'),
    ...[...stories, ...guides].map((a) => ({ ...page(`/stories/${a.slug}`, 0.5, 'yearly'), lastModified: a.publishedAt ?? undefined })),
    page('/gallery', 0.6),
    page('/about', 0.6),
    page('/testimonials', 0.5),
    page('/faq', 0.5),
    page('/contact', 0.7, 'yearly'),
    page('/quote', 0.8, 'yearly'),
    page('/delivery-policy', 0.2, 'yearly'),
    page('/privacy', 0.2, 'yearly'),
  ];
}
