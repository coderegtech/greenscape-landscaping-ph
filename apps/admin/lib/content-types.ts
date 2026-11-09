// Form configuration for each CMS content type. Mirrors the Zod schemas in @greenscape/content, which the API
// enforces on every save; anything not covered here can still be edited in the editor's JSON tab.

export type Field =
  | { kind: 'text' | 'textarea' | 'month' | 'url'; key: string; label: string; hint?: string; required?: boolean; max?: number }
  | { kind: 'number'; key: string; label: string; hint?: string; required?: boolean }
  | { kind: 'toggle'; key: string; label: string; hint?: string }
  | { kind: 'select'; key: string; label: string; options: Record<string, string>; required?: boolean }
  | { kind: 'richtext'; key: string; label: string; hint?: string; required?: boolean }
  | { kind: 'image'; key: string; label: string; hint?: string; required?: boolean }
  | { kind: 'images'; key: string; label: string; hint?: string; min?: number }
  | { kind: 'stringList'; key: string; label: string; hint?: string; itemLabel: string }
  | { kind: 'group'; key: string; label: string; fields: Field[]; optional?: boolean }
  | { kind: 'list'; key: string; label: string; itemLabel: string; fields: Field[]; newItem: () => Record<string, unknown>; titleKey?: string }
  | { kind: 'sections'; key: string; label: string };

export const EMPTY_DOC = { type: 'doc', content: [] };
const cta = (): Field => ({ kind: 'group', key: 'cta', label: 'Button', optional: true, fields: [{ kind: 'text', key: 'label', label: 'Button text', max: 60 }, { kind: 'url', key: 'href', label: 'Link (e.g. /quote)' }] });

export const PROJECT_CATEGORIES = { 'residential-garden': 'Residential garden', 'commercial-landscaping': 'Commercial landscaping', 'indoor-landscaping': 'Indoor landscaping', 'landscape-rehabilitation': 'Landscape rehabilitation', 'vertical-garden': 'Vertical garden' };

/** Page section types: label, fields, and a valid starting value. */
export const SECTION_TYPES: Record<string, { label: string; fields: Field[]; create: () => Record<string, unknown> }> = {
  hero: {
    label: 'Hero',
    fields: [{ kind: 'list', key: 'slides', label: 'Slides', itemLabel: 'slide', titleKey: 'headline', newItem: () => ({ headline: '', image: null }), fields: [{ kind: 'text', key: 'headline', label: 'Headline', required: true, max: 120 }, { kind: 'text', key: 'subheadline', label: 'One sentence', max: 240 }, { kind: 'image', key: 'image', label: 'Photograph', required: true }, cta()] }],
    create: () => ({ type: 'hero', slides: [] }),
  },
  serviceGrid: { label: 'Services grid', fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'stringList', key: 'serviceSlugs', label: 'Services (slugs, in order)', itemLabel: 'service slug' }], create: () => ({ type: 'serviceGrid', heading: 'Our services', serviceSlugs: ['garden-design', 'landscaping', 'garden-maintenance', 'garden-essentials'] }) },
  featuredProjects: { label: 'Featured projects', fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'number', key: 'limit', label: 'How many', required: true }], create: () => ({ type: 'featuredProjects', heading: 'Featured projects', limit: 4 }) },
  gallery: { label: 'Gallery strip', fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'number', key: 'limit', label: 'How many photos', required: true }], create: () => ({ type: 'gallery', heading: 'From our sites', limit: 8 }) },
  articles: { label: 'Latest stories', fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'number', key: 'limit', label: 'How many', required: true }], create: () => ({ type: 'articles', heading: 'Stories', limit: 3 }) },
  testimonials: { label: 'Testimonials', fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'number', key: 'limit', label: 'How many', required: true }], create: () => ({ type: 'testimonials', heading: 'What clients say', limit: 3 }) },
  richText: { label: 'Text', fields: [{ kind: 'richtext', key: 'body', label: 'Text', required: true }], create: () => ({ type: 'richText', body: EMPTY_DOC }) },
  mediaText: {
    label: 'Text with photo',
    fields: [{ kind: 'text', key: 'heading', label: 'Heading', required: true }, { kind: 'richtext', key: 'body', label: 'Text', required: true }, { kind: 'image', key: 'image', label: 'Photograph' }, { kind: 'select', key: 'imageSide', label: 'Photo side', options: { right: 'Right', left: 'Left' } }],
    create: () => ({ type: 'mediaText', heading: '', body: EMPTY_DOC, imageSide: 'right' }),
  },
  photos: { label: 'Photo grid', fields: [{ kind: 'text', key: 'heading', label: 'Heading' }, { kind: 'images', key: 'images', label: 'Photographs', min: 1 }], create: () => ({ type: 'photos', images: [] }) },
  stats: {
    label: 'Figures',
    fields: [{ kind: 'list', key: 'items', label: 'Figures', itemLabel: 'figure', titleKey: 'label', newItem: () => ({ value: 0, label: '' }), fields: [{ kind: 'number', key: 'value', label: 'Number', required: true }, { kind: 'text', key: 'suffix', label: 'Suffix (e.g. +)', max: 4 }, { kind: 'text', key: 'label', label: 'Label', required: true, max: 40 }] }],
    create: () => ({ type: 'stats', items: [] }),
  },
  cta: { label: 'Call to action', fields: [{ kind: 'text', key: 'headline', label: 'Headline', max: 120 }, { kind: 'textarea', key: 'body', label: 'Sentence', max: 400 }, cta()], create: () => ({ type: 'cta' }) },
  quoteForm: { label: 'Quote invitation', fields: [], create: () => ({ type: 'quoteForm' }) },
  contact: { label: 'Contact details', fields: [], create: () => ({ type: 'contact' }) },
};

export const CONTENT_TYPES = {
  pages: {
    label: 'Pages',
    singular: 'page',
    publicPath: (slug: string) => (slug === 'home' ? '/' : `/${slug}`),
    fields: [{ kind: 'text', key: 'title', label: 'Title', required: true, max: 120 }, { kind: 'textarea', key: 'lead', label: 'Lead sentence', max: 240 }, { kind: 'sections', key: 'sections', label: 'Sections' }] as Field[],
    templates: {
      blank: { label: 'Blank page', body: () => ({ title: '', sections: [] }) },
      text: { label: 'Text page (policy, terms)', body: () => ({ title: '', sections: [SECTION_TYPES.richText!.create()] }) },
      landing: { label: 'Landing page (hero, services, projects, quote)', body: () => ({ title: '', sections: [SECTION_TYPES.hero!.create(), SECTION_TYPES.serviceGrid!.create(), SECTION_TYPES.featuredProjects!.create(), SECTION_TYPES.quoteForm!.create()] }) },
    },
  },
  services: {
    label: 'Services',
    singular: 'service',
    publicPath: (slug: string) => `/services/${slug}`,
    fields: [
      { kind: 'text', key: 'title', label: 'Title', required: true, max: 80 },
      { kind: 'textarea', key: 'summary', label: 'Summary', required: true, max: 300 },
      { kind: 'image', key: 'hero', label: 'Banner photograph', required: true },
      { kind: 'stringList', key: 'highlights', label: 'What it covers', itemLabel: 'item' },
      { kind: 'group', key: 'stat', label: 'Figure on the services grid', optional: true, fields: [{ kind: 'text', key: 'value', label: 'Number (e.g. 50+)', max: 10 }, { kind: 'text', key: 'label', label: 'Label (e.g. projects)', max: 30 }] },
      { kind: 'list', key: 'steps', label: 'How a project runs', itemLabel: 'step', titleKey: 'title', newItem: () => ({ title: '', body: EMPTY_DOC }), fields: [{ kind: 'text', key: 'title', label: 'Step title', required: true, max: 80 }, { kind: 'text', key: 'lead', label: 'One line', max: 200 }, { kind: 'richtext', key: 'body', label: 'Text', required: true }, { kind: 'image', key: 'image', label: 'Photograph' }] },
      { kind: 'list', key: 'packages', label: 'Packages', itemLabel: 'package', titleKey: 'name', newItem: () => ({ name: '', frequency: '', features: [], featured: false }), fields: [{ kind: 'text', key: 'name', label: 'Name', required: true, max: 40 }, { kind: 'text', key: 'frequency', label: 'Frequency', required: true, max: 60 }, { kind: 'text', key: 'area', label: 'Area (e.g. 100 sqm area)', max: 40 }, { kind: 'number', key: 'pricePhp', label: 'Price (₱)' }, { kind: 'stringList', key: 'features', label: 'Included', itemLabel: 'item' }, { kind: 'toggle', key: 'featured', label: 'Recommended' }, { kind: 'image', key: 'image', label: 'Photograph' }] },
      { kind: 'list', key: 'transformations', label: 'Before and after', itemLabel: 'comparison', titleKey: 'title', newItem: () => ({ title: '', before: null, after: null }), fields: [{ kind: 'text', key: 'title', label: 'Title', required: true, max: 120 }, { kind: 'text', key: 'location', label: 'Location', max: 80 }, { kind: 'textarea', key: 'description', label: 'Description', max: 600 }, { kind: 'image', key: 'before', label: 'Before', required: true }, { kind: 'image', key: 'after', label: 'After', required: true }] },
    ] as Field[],
    templates: { blank: { label: 'New service', body: () => ({ title: '', summary: '', hero: null, steps: [], highlights: [], pricingNotes: [], packages: [], transformations: [] }) } },
  },
  projects: {
    label: 'Projects',
    singular: 'project',
    publicPath: (slug: string) => `/projects/${slug}`,
    fields: [
      { kind: 'text', key: 'title', label: 'Title', required: true, max: 140 },
      { kind: 'select', key: 'category', label: 'Category', options: PROJECT_CATEGORIES, required: true },
      { kind: 'text', key: 'location', label: 'Location', max: 120 },
      { kind: 'month', key: 'completedOn', label: 'Completed (month)' },
      { kind: 'textarea', key: 'excerpt', label: 'Summary for cards', required: true, max: 400 },
      { kind: 'richtext', key: 'body', label: 'Story of the project' },
      { kind: 'images', key: 'images', label: 'Photographs (first is the cover)', min: 1 },
      { kind: 'toggle', key: 'isFeatured', label: 'Feature on the home page' },
    ] as Field[],
    templates: { blank: { label: 'New project', body: () => ({ title: '', category: 'residential-garden', excerpt: '', body: EMPTY_DOC, images: [], isFeatured: false }) } },
  },
  articles: {
    label: 'Stories and guides',
    singular: 'story',
    publicPath: (slug: string) => `/stories/${slug}`,
    fields: [
      { kind: 'text', key: 'title', label: 'Title', required: true, max: 160 },
      { kind: 'select', key: 'topic', label: 'Section', options: { story: 'Stories', 'garden-essentials': 'Garden essentials guide' }, required: true },
      { kind: 'text', key: 'author', label: 'Author', required: true, max: 80 },
      { kind: 'text', key: 'authorRole', label: 'Author role', max: 80 },
      { kind: 'textarea', key: 'excerpt', label: 'Summary', required: true, max: 400 },
      { kind: 'image', key: 'cover', label: 'Cover photograph', required: true },
      { kind: 'text', key: 'photoCredit', label: 'Photo credit', max: 120 },
      { kind: 'richtext', key: 'body', label: 'Story', required: true },
      { kind: 'images', key: 'images', label: 'More photographs' },
      { kind: 'stringList', key: 'youtubeIds', label: 'YouTube videos (11-character ids)', itemLabel: 'video id' },
    ] as Field[],
    templates: { blank: { label: 'New story', body: () => ({ title: '', topic: 'story', excerpt: '', author: '', cover: null, images: [], body: EMPTY_DOC, youtubeIds: [] }) } },
  },
} as const;

export type TypeKey = keyof typeof CONTENT_TYPES;
export const isTypeKey = (t: string): t is TypeKey => t in CONTENT_TYPES;

/** Immutable set by path (["sections", 2, "heading"]). */
export function setIn<T>(obj: T, path: (string | number)[], value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const base: Record<string | number, unknown> = Array.isArray(obj) ? [...(obj as unknown[])] as never : { ...(obj as object) };
  base[head!] = setIn((obj as Record<string | number, unknown> | undefined)?.[head!], rest, value);
  return base as T;
}

/** Drops empty optional values the schema rejects ("" strings, null images, empty optional groups). */
export function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (c === '' || c === null || c === undefined) continue;
      if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out;
  }
  return value;
}
