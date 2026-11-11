/* eslint-disable @typescript-eslint/no-explicit-any -- input is untyped JSON exported from Firestore; every output is Zod-validated. */
// Builds CMS documents from the extracted public content and upserts them into MongoDB (idempotent, keyed by slug).
// Inputs: scripts/migrate/data/{firestore-public,public-content}.json  (see fetch-public-firestore.mjs, scrape-public.mjs)
// Every document is validated with the Zod schemas in @greenscape/content before it is written.
// Usage: pnpm content:seed
import fs from 'node:fs';
import path from 'node:path';
import {
  Article, Faq, GalleryItem, Navigation, Page, Project, Service, SiteConfig, Testimonial, collections, connectContentDb, ensureIndexes,
  type MediaRef, type RichTextNode, type Section,
} from '@greenscape/content';
import type { z } from 'zod';
import { analyticsSection } from './privacy-analytics.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env')); } catch { /* CI env */ }

const DATA = path.resolve(import.meta.dirname, 'data');
const fsd = JSON.parse(fs.readFileSync(path.join(DATA, 'firestore-public.json'), 'utf8'));
const scraped = JSON.parse(fs.readFileSync(path.join(DATA, 'public-content.json'), 'utf8'));
const SYSTEM_USER = '00000000-0000-4000-8000-000000000000';
const now = new Date();

// ── helpers ──
const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
const img = (url: string | null | undefined, alt: string): MediaRef | undefined => (url ? { url, alt: alt.slice(0, 300) } : undefined);
const text = (s: string): RichTextNode => ({ type: 'text', text: s });
/** Plain text with blank-line paragraphs (and single-newline breaks) → rich-text JSON. */
function rich(src: string | null | undefined): { type: 'doc'; content: RichTextNode[] } {
  const paras = (src ?? '').replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: 'doc',
    content: paras.map((p) => ({ type: 'paragraph', content: p.split('\n').flatMap((line, i) => (i ? [{ type: 'hardBreak' }, text(line)] : [text(line)])) })),
  };
}
/** Scraped page blocks (h2/p/li) → rich text, grouping consecutive list items. */
function richFromBlocks(blocks: { t: string; v?: string }[]) {
  const content: RichTextNode[] = [];
  let list: RichTextNode | null = null;
  for (const b of blocks) {
    if (!b.v) continue;
    if (b.t === 'li') {
      if (!list) content.push((list = { type: 'bulletList', content: [] }));
      list.content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: [text(b.v)] }] });
      continue;
    }
    list = null;
    if (b.t === 'h2' || b.t === 'h3') content.push({ type: 'heading', attrs: { level: 2 }, content: [text(b.v)] });
    else if (b.t === 'p') content.push({ type: 'paragraph', content: [text(b.v)] });
  }
  return { type: 'doc' as const, content };
}
const yearMonth = (d?: string | null) => {
  if (!d) return undefined;
  if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  const t = Date.parse(d.length <= 9 ? `1 ${d}` : d);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 7);
};
const cover = (key: string) => fsd.pageCovers?.[key] as string | undefined;
const coverLead = (key: string) => fsd.pageCovers?.[`${key}_subtitle`] as string | undefined;
const envelope = <B>(slug: string, body: B, seo: { title?: string; description?: string } = {}, legacy?: { firestoreId?: string; url?: string }) => ({
  slug, locale: 'en' as const, status: 'published' as const, publishedAt: now, revision: 1, draft: body, published: body,
  seo: { ...(seo.title ? { title: seo.title.slice(0, 70) } : {}), ...(seo.description ? { description: seo.description.slice(0, 170) } : {}) },
  updatedBy: SYSTEM_USER, updatedAt: now, ...(legacy ? { legacy } : {}),
});
const scrapedPage = (url: string) => scraped.pages.find((p: { url: string }) => p.url === url);
const parse = <S extends z.ZodType>(schema: S, doc: unknown, label: string): z.infer<S> => {
  const r = schema.safeParse(doc);
  if (!r.success) throw new Error(`${label}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
};

// ── services ──
const serviceSlug: Record<string, string> = { 'garden-design': 'garden-design', 'garden-essential': 'garden-essentials', landscaping: 'landscaping', 'garden-maintenance': 'garden-maintenance' };
const services = fsd.services.map((s: any) => {
  const slug = serviceSlug[s.id] ?? slugify(s.title);
  const [value, ...label] = String(s.badge ?? '').split(' ');
  const steps =
    slug === 'landscaping'
      ? [...fsd.landscapingSteps].sort((a: any, b: any) => a.order - b.order).map((st: any) => ({ title: st.title, lead: st.excerpt?.slice(0, 200), body: rich(st.content), image: img(st.imageUrl, st.title) }))
      : [];
  const packages =
    slug === 'garden-maintenance'
      ? [...fsd.maintenancePackages]
          .sort((a: any, b: any) => (a.price ?? 0) - (b.price ?? 0))
          .map((p: any) => ({
            name: p.name, frequency: p.frequency, area: p.area?.replace(/Smq/i, 'sqm'), pricePhp: p.price, featured: !!p.featured, image: img(p.image, `${p.name} maintenance`),
            features: (p.features ?? []).filter((f: string) => /^[A-Z][a-z]/.test(f) && f.length > 3), // drops placeholder entries such as "sdsds" on the live site
          }))
      : [];
  const transformations =
    slug === 'garden-design'
      ? fsd.transformations.filter((t: any) => t.status !== 'draft').map((t: any) => ({ title: t.title, location: t.location, description: t.description, before: img(t.beforeImage, `${t.title}, before`)!, after: img(t.afterImage, `${t.title}, after`)! }))
      : [];
  const body = {
    title: s.title,
    summary: s.description,
    hero: img(cover(`service-${slug}`) ?? s.images?.[0]?.url, s.title)!,
    steps,
    highlights: s.items ?? [],
    pricingNotes: [],
    stat: value && label.length ? { value, label: label.join(' ').toLowerCase() } : undefined,
    packages,
    transformations,
  };
  return parse(Service, envelope(slug, body, { title: s.title, description: coverLead(`service-${slug}`) ?? s.description }, { firestoreId: s.id, url: `/pages/services/${s.id}/` }), `service ${slug}`);
});

// ── projects ──
const categoryOf: Record<string, string> = { residential: 'residential-garden', commercial: 'commercial-landscaping', indoor: 'indoor-landscaping', rehabilitation: 'landscape-rehabilitation' };
const projectSlugs = new Set<string>();
const projects = fsd.projects.map((p: any) => {
  let slug = slugify(p.title);
  while (projectSlugs.has(slug)) slug += '-2';
  projectSlugs.add(slug);
  const urls: string[] = (p.imageUrls?.length ? p.imageUrls : [p.imageUrl]).filter(Boolean);
  const body = {
    title: p.title,
    category: categoryOf[p.category] ?? 'residential-garden',
    location: p.location || undefined,
    completedOn: yearMonth(p.date),
    excerpt: (p.description ?? '').split(/\n{2,}/)[0].slice(0, 400),
    body: rich(p.description),
    images: urls.map((u, i) => img(u, i === 0 ? p.title : `${p.title}, photo ${i + 1}`)!),
    isFeatured: !!p.isFeatured,
  };
  return parse(Project, envelope(slug, body, { title: p.title, description: body.excerpt }, { firestoreId: p.id }), `project ${slug}`);
});

// ── articles: stories + garden essentials ──
const articleSlugs = new Set<string>();
const uniqueSlug = (t: string) => { let s = slugify(t); while (articleSlugs.has(s)) s += '-2'; articleSlugs.add(s); return s; };
const youtubeId = (u?: string) => u?.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1];
const stories = fsd.stories.map((s: any) => {
  const slug = uniqueSlug(s.title);
  const coverUrl = s.thumbnailUrl || s.imageUrl;
  const body = {
    title: s.title, topic: 'story', excerpt: (s.excerpt || s.content || '').slice(0, 400), author: s.author || 'Greenscape',
    cover: img(coverUrl, s.title)!, images: s.imageUrl && s.imageUrl !== coverUrl ? [img(s.imageUrl, s.title)!] : [],
    body: rich(s.content), youtubeIds: youtubeId(s.youtubeUrl) ? [youtubeId(s.youtubeUrl)] : [],
  };
  const doc = envelope(slug, body, { title: s.title, description: body.excerpt }, { firestoreId: s.id, url: `/pages/our-story/story.html?id=${s.id}` });
  return parse(Article, { ...doc, publishedAt: new Date(s.createdAt ?? s.createTime) }, `story ${slug}`);
});
const essentials = Object.entries(fsd.gardenEssentials?.articles ?? {}).map(([id, a]: [string, any]) => {
  const slug = uniqueSlug(a.title);
  const body = {
    title: a.title, topic: 'garden-essentials', excerpt: (a.synopsis ?? '').slice(0, 400), author: a.author || 'Greenscape', authorRole: a.authorRole?.trim() || undefined,
    cover: img(a.imageUrl, a.title)!, images: [], body: rich(a.content), youtubeIds: [], photoCredit: a.photoCredit || undefined,
  };
  const doc = envelope(slug, body, { title: a.title, description: body.excerpt }, { firestoreId: id });
  return parse(Article, { ...doc, publishedAt: a.date ? new Date(a.date) : now }, `essentials ${slug}`);
});

// ── gallery, testimonials, faqs ──
const gallery = fsd.gallery.map((g: any, i: number) =>
  parse(GalleryItem, { image: img(g.imageUrl, g.title || 'Greenscape project photograph'), caption: g.title || undefined, sortOrder: i, status: 'published', updatedAt: now }, `gallery ${i}`),
);
// Public site shows "First L." — keep that, never the full name.
const shortName = (n: string) => { const [first, ...rest] = n.trim().split(/\s+/); return rest.length ? `${first} ${rest.at(-1)![0]}.` : first; };
const testimonials = fsd.testimonials.map((t: any, i: number) =>
  parse(Testimonial, { name: shortName(t.name), role: t.role || undefined, rating: t.rating || 5, text: t.text, status: 'approved', createdAt: new Date(t.createdAt ?? t.createTime) }, `testimonial ${i}`),
);
const faqs = [...fsd.faqs].filter((f: any) => f.active !== false).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((f: any, i: number) =>
  parse(Faq, { locale: 'en', topic: f.category || 'General', question: f.question, answer: rich(f.answer), sortOrder: i, status: 'published' }, `faq ${i}`),
);

// ── pages ──
const heroSlides = (fsd.hero?.images ?? []).map((im: any, i: number) => ({
  headline: 'Green today, greener tomorrow.',
  subheadline: 'Garden design, landscaping and care across Palawan, from our nurseries in Aborlan and Taytay.',
  image: img(im.url, i === 0 ? 'Resort landscape at Maremegmeg Beach, El Nido' : 'Greenscape landscape project in Palawan')!,
}));
const sectionList = (s: Section[]) => s;
const about = fsd.about;
const aboutSections = sectionList(
  (about?.sections ?? []).filter((s: any) => !s.isDivider && (s.title || s.paragraph1)).map((s: any, i: number): Section =>
    s.isPhotoExhibit
      ? { type: 'photos', heading: s.title || undefined, images: [s.imageUrl, ...(s.images ?? []).map((x: any) => x.url ?? x)].filter(Boolean).slice(0, 12).map((u: string) => img(u, s.title || 'Greenscape at work')!) }
      : { type: 'mediaText', heading: (s.title || '').replace(/\?$/, ''), body: rich([s.paragraph1, s.paragraph2].filter(Boolean).join('\n\n')), image: img(s.imageUrl, s.title || 'Greenscape'), imageSide: i % 2 ? 'left' : 'right' },
  ),
);
const policy = (url: string) => richFromBlocks((scrapedPage(url)?.blocks ?? []).filter((b: any) => b.t !== 'h1'));
const page = (slug: string, title: string, lead: string | undefined, sections: Section[], seo: { title?: string; description?: string } = {}, legacyUrl?: string) =>
  parse(Page, envelope(slug, { title, lead, sections }, { title: seo.title ?? title, description: seo.description ?? lead }, legacyUrl ? { url: legacyUrl } : undefined), `page ${slug}`);

const pages = [
  page('home', 'Greenscape Landscaping Services', undefined, [
    { type: 'hero', slides: heroSlides },
    { type: 'serviceGrid', heading: 'Four ways we look after a garden', serviceSlugs: ['garden-design', 'landscaping', 'garden-maintenance', 'garden-essentials'] },
    { type: 'featuredProjects', heading: 'Gardens we have built', limit: 4 },
    { type: 'gallery', heading: 'From our sites', limit: 8 },
    { type: 'articles', heading: 'Stories from the team', limit: 3 },
    { type: 'testimonials', heading: 'What clients say', limit: 3 },
    { type: 'quoteForm' },
  ], { title: 'Greenscape Landscaping Services | Palawan', description: 'Garden design, landscaping, garden maintenance and plants in Puerto Princesa, Palawan.' }, '/index.html'),
  page('about', about?.headerTitle === 'About Us' ? 'About Greenscape' : about?.headerTitle ?? 'About Greenscape', about?.headerSubtitle || coverLead('about-greenscape') || 'Landscapers, growers and gardeners working across Palawan.', [{ type: 'hero', slides: [{ headline: 'About Greenscape', image: img(cover('about-greenscape'), 'Greenscape team on site')! }] }, ...aboutSections], {}, '/pages/about-greenscape/'),
  page('services', 'Services', 'Design, build, care and supply: one team from the first site visit to the hundredth pruning.', [], {}, undefined),
  page('projects', 'Projects', coverLead('project-commercial-landscaping') ?? 'Resorts, homes, offices and public spaces across Palawan.', [], {}, undefined),
  page('stories', 'Stories', coverLead('our-stories') ?? 'News and people from the Greenscape team.', [], {}, '/pages/our-story/'),
  page('gallery', 'Gallery', coverLead('gallery') ?? 'Photographs from our sites.', [], {}, '/pages/gallery.html'),
  page('testimonials', 'Client feedback', 'What clients say after we hand a garden over.', [], {}, '/pages/testimonials.html'),
  page('faq', 'Questions we are often asked', 'About services, pricing, timelines and where we work.', [], {}, '/pages/contact/faq.html'),
  page('contact', 'Contact Greenscape', 'Visit the San Jose office, call, or send a message.', [{ type: 'contact' }], {}, '/pages/contact/'),
  page('quote', 'Request a quote', 'Tell us about the space. We reply within one working day.', [{ type: 'quoteForm' }], { description: 'Request a free quote for garden design, landscaping and maintenance in Palawan.' }, '/pages/get-a-quote/'),
  page('delivery-policy', 'Delivery terms', 'Where and how we deliver plants and materials.', [{ type: 'richText', body: policy('/pages/delivery-policy.html') }], {}, '/pages/delivery-policy.html'),
  page('privacy', 'Privacy notice', 'How we collect, use and protect your information under the Data Privacy Act of 2012.', [{ type: 'richText', body: policy('/pages/privacy-policy.html') }, analyticsSection], {}, '/pages/privacy-policy.html'),
];

// ── navigation + site config ──
const nav = (key: 'main' | 'footer', items: unknown) => parse(Navigation, { key, locale: 'en', items, updatedAt: now }, `nav ${key}`);
const serviceLinks = [
  { label: 'Garden design', href: '/services/garden-design' },
  { label: 'Landscaping', href: '/services/landscaping' },
  { label: 'Garden maintenance', href: '/services/garden-maintenance' },
  { label: 'Garden essentials', href: '/services/garden-essentials' },
];
const navigation = [
  nav('main', [
    { label: 'Services', href: '/services', children: serviceLinks },
    { label: 'Projects', href: '/projects', children: Object.values(categoryOf).map((c) => ({ label: c.replace(/-/g, ' ').replace(/^./, (x) => x.toUpperCase()), href: `/projects?category=${c}` })) },
    { label: 'Shop', href: '/shop' },
    { label: 'Stories', href: '/stories' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ]),
  nav('footer', [
    { label: 'Services', href: '/services', children: serviceLinks },
    { label: 'Shop', href: '/shop', children: [{ label: 'All plants', href: '/shop' }, { label: 'Delivery terms', href: '/delivery-policy' }, { label: 'Your account', href: '/account' }] },
    { label: 'Company', href: '/about', children: [{ label: 'About Greenscape', href: '/about' }, { label: 'Projects', href: '/projects' }, { label: 'Stories', href: '/stories' }, { label: 'Gallery', href: '/gallery' }, { label: 'Client feedback', href: '/testimonials' }, { label: 'FAQ', href: '/faq' }, { label: 'Privacy notice', href: '/privacy' }] },
  ]),
];
const siteConfig = parse(SiteConfig, {
  locale: 'en', companyName: 'Greenscape Landscaping Services', tagline: 'Green today, greener tomorrow.',
  address: 'Tian Suy Go, San Jose, Puerto Princesa City 5300, Palawan', phone: '0917 844 3330', email: 'greenscapepalawan@gmail.com',
  socials: { facebook: 'https://www.facebook.com/greenscapepalawan', instagram: 'https://www.instagram.com/greenscape.palawan/' },
  seoDefaults: { title: 'Greenscape Landscaping Services | Palawan', description: 'Garden design, landscaping, garden maintenance and plants in Puerto Princesa, Palawan.' },
  updatedAt: now,
}, 'siteConfig');

// ── write ──
const { client, db } = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
await ensureIndexes(db);
const upsert = async (coll: string, key: Record<string, unknown>, doc: object) => db.collection(coll).replaceOne(key, doc, { upsert: true });
for (const d of services) await upsert(collections.services, { slug: d.slug, locale: d.locale }, d);
for (const d of projects) await upsert(collections.projects, { slug: d.slug, locale: d.locale }, d);
for (const d of [...stories, ...essentials]) await upsert(collections.articles, { slug: d.slug, locale: d.locale }, d);
for (const d of pages) await upsert(collections.pages, { slug: d.slug, locale: d.locale }, d);
for (const d of navigation) await upsert(collections.navigation, { key: d.key, locale: d.locale }, d);
await upsert(collections.siteConfig, { locale: 'en' }, siteConfig);
// Collections without a natural key are replaced wholesale (they only hold imported items at this stage).
for (const [coll, docs] of [[collections.galleryItems, gallery], [collections.testimonials, testimonials], [collections.faqs, faqs]] as const) {
  await db.collection(coll).deleteMany({ imported: true });
  if (docs.length) await db.collection(coll).insertMany(docs.map((d: object) => ({ ...d, imported: true })));
}
console.log(`seeded: ${services.length} services, ${projects.length} projects, ${stories.length} stories + ${essentials.length} essentials, ${pages.length} pages, ${gallery.length} gallery, ${testimonials.length} testimonials, ${faqs.length} faqs, nav + site config`);
await client.close();
