import 'server-only';
import type { ArticleBody, MediaRef, PageBody, ProjectBody, RichTextNode, Section, ServiceBody } from '@greenscape/content';
import { draftMode } from 'next/headers';
import type { z } from 'zod';

// Server-side reads of the public CMS API. Next caches each response and tags it, so a CMS publish
// (Phase 7) can revalidate exactly the pages that used it. A missing document returns null (→ notFound()).

const API = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const REVALIDATE = 300;

export class CmsUnavailable extends Error {}

/**
 * `previewable`: single-document reads honour draft mode (CMS preview: drafts, server-to-server, never cached).
 * Lists never do: they show published content only, and they run in generateStaticParams, where draftMode() is forbidden.
 */
async function get<T>(path: string, tags: string[], previewable = false): Promise<T | null> {
  let res: Response;
  const preview = previewable && !!process.env.PREVIEW_SECRET && (await draftMode()).isEnabled;
  try {
    res = await fetch(`${API()}/v1/cms${path}`, preview
      ? { cache: 'no-store', headers: { 'x-preview-secret': process.env.PREVIEW_SECRET! }, signal: AbortSignal.timeout(8000) }
      : { next: { revalidate: REVALIDATE, tags }, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw new CmsUnavailable(`CMS unreachable: ${(err as Error).message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new CmsUnavailable(`CMS ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

type Envelope = { slug: string; publishedAt: string | null; seo: { title?: string; description?: string; ogImage?: MediaRef } };
export type CmsPage = Envelope & z.infer<typeof PageBody>;
export type CmsService = Envelope & z.infer<typeof ServiceBody>;
export type CmsProject = Envelope & z.infer<typeof ProjectBody>;
export type CmsArticle = Envelope & z.infer<typeof ArticleBody>;
export type { MediaRef, RichTextNode, Section };

export interface ServiceSummary { slug: string; title: string; summary: string; hero: MediaRef; stat: { value: string; label: string } | null; highlights: string[] }
export interface ProjectSummary { slug: string; title: string; category: string; location: string | null; completedOn: string | null; excerpt: string; cover: MediaRef; imageCount: number; isFeatured: boolean }
export interface ArticleSummary { slug: string; title: string; topic: 'story' | 'garden-essentials'; excerpt: string; author: string; cover: MediaRef; publishedAt: string | null }
export interface GalleryItem { image: MediaRef; caption?: string; category?: string }
export interface Testimonial { name: string; role?: string; projectType?: string; rating: number; text: string; createdAt: string }
export interface FaqItem { topic: string; question: string; answer: { type: 'doc'; content: RichTextNode[] } }
export interface NavItem { label: string; href: string; children?: { label: string; href: string }[] }
export interface SiteData {
  config: { companyName: string; tagline?: string; address: string; phone: string; email: string; hours?: string; socials: { facebook?: string; instagram?: string; pinterest?: string } } | null;
  nav: { main?: NavItem[]; footer?: NavItem[] };
}

export const cms = {
  site: () => get<SiteData>('/site', ['cms:site']),
  page: (slug: string) => get<CmsPage>(`/pages/${slug}`, ['cms:pages', `cms:pages:${slug}`], true),
  services: () => get<ServiceSummary[]>('/services', ['cms:services']).then((x) => x ?? []),
  service: (slug: string) => get<CmsService>(`/services/${slug}`, ['cms:services', `cms:services:${slug}`], true),
  projects: (q: { category?: string; featured?: boolean; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.category) p.set('category', q.category);
    if (q.featured) p.set('featured', 'true');
    if (q.limit) p.set('limit', String(q.limit));
    return get<ProjectSummary[]>(`/projects?${p}`, ['cms:projects']).then((x) => x ?? []);
  },
  project: (slug: string) => get<CmsProject>(`/projects/${slug}`, ['cms:projects', `cms:projects:${slug}`], true),
  articles: (q: { topic?: 'story' | 'garden-essentials'; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.topic) p.set('topic', q.topic);
    if (q.limit) p.set('limit', String(q.limit));
    return get<ArticleSummary[]>(`/articles?${p}`, ['cms:articles']).then((x) => x ?? []);
  },
  article: (slug: string) => get<CmsArticle>(`/articles/${slug}`, ['cms:articles', `cms:articles:${slug}`], true),
  legacyArticle: (id: string) => get<{ slug: string }>(`/articles/legacy/${encodeURIComponent(id)}`, ['cms:articles']),
  gallery: (limit = 48) => get<GalleryItem[]>(`/gallery?limit=${limit}`, ['cms:galleryItems']).then((x) => x ?? []),
  testimonials: (limit = 24) => get<Testimonial[]>(`/testimonials?limit=${limit}`, ['cms:testimonials']).then((x) => x ?? []),
  faqs: () => get<FaqItem[]>('/faqs', ['cms:faqs']).then((x) => x ?? []),
};

export const PROJECT_CATEGORIES: Record<string, string> = {
  'residential-garden': 'Residential gardens',
  'commercial-landscaping': 'Commercial landscaping',
  'indoor-landscaping': 'Indoor landscaping',
  'landscape-rehabilitation': 'Landscape rehabilitation',
  'vertical-garden': 'Vertical gardens',
};

export const monthYear = (ym?: string | null) => (ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null);
export const longDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }) : null);
