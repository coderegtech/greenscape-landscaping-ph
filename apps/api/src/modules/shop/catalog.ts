// Catalogue reads (public) and their cache tags. Prices and product data are cached; stock never is.
import { collections } from '@greenscape/content';
import type { Prisma } from '@greenscape/database';
import { PLANT_TYPES, SHOP_CATEGORIES, type CatalogQuery } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { money } from './orders.ts';

export const CATALOG_TTL = 300;
export const shopTags = (slug?: string) => ['shop:catalog', ...(slug ? [`shop:product:${slug}`] : [])];

type ImageRow = { alt: string | null; sortOrder: number; media: { path: string; width: number | null; height: number | null; blurDataUrl: string | null; alt: string | null } };
export const imageView = (deps: Pick<Deps, 'storage'>, i: ImageRow, fallbackAlt: string) => ({
  url: deps.storage.publicUrl(i.media.path),
  alt: i.alt ?? i.media.alt ?? fallbackAlt,
  width: i.media.width,
  height: i.media.height,
  blurDataUrl: i.media.blurDataUrl,
});

const productInclude = {
  category: { select: { slug: true } },
  variants: { where: { isActive: true }, select: { id: true, price: true, compareAtPrice: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, include: { media: true } },
} satisfies Prisma.ProductInclude;

export async function listProducts(deps: Deps, q: CatalogQuery) {
  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    ...(q.category ? { category: { slug: q.category } } : {}),
    ...(q.plantType ? { plantType: q.plantType } : {}),
    ...(q.flag === 'new' ? { isNew: true } : q.flag === 'featured' ? { isFeatured: true } : q.flag === 'bestseller' ? { isBestSeller: true } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { scientificName: { contains: q.q, mode: 'insensitive' } }, { nativeName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  // shortcut: sorts and pages in memory (the catalogue is ~100 products); move price sort into SQL past a few thousand.
  const rows = await deps.db.product.findMany({ where, include: productInclude, take: 2000 });
  const items = rows.map((p) => {
    const prices = p.variants.map((v) => Number(v.price));
    const cheapest = p.variants.reduce<(typeof p.variants)[number] | null>((m, v) => (!m || Number(v.price) < Number(m.price) ? v : m), null);
    return {
      slug: p.slug,
      name: p.name,
      scientificName: p.scientificName,
      category: p.category.slug,
      plantType: p.plantType,
      isNew: p.isNew,
      isFeatured: p.isFeatured,
      isBestSeller: p.isBestSeller,
      image: p.images[0] ? imageView(deps, p.images[0], p.name) : null,
      priceFrom: cheapest ? money(cheapest.price) : null,
      compareAt: cheapest?.compareAtPrice ? money(cheapest.compareAtPrice) : null,
      priceVaries: new Set(prices).size > 1,
      createdAt: p.createdAt.getTime(),
    };
  });
  const price = (x: (typeof items)[number]) => (x.priceFrom === null ? Infinity : Number(x.priceFrom));
  const byName = (a: (typeof items)[number], b: (typeof items)[number]) => a.name.localeCompare(b.name);
  const sorters = {
    featured: (a: (typeof items)[number], b: (typeof items)[number]) => Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isBestSeller) - Number(a.isBestSeller) || Number(a.priceFrom === null) - Number(b.priceFrom === null) || byName(a, b),
    newest: (a: (typeof items)[number], b: (typeof items)[number]) => b.createdAt - a.createdAt || byName(a, b),
    'price-asc': (a: (typeof items)[number], b: (typeof items)[number]) => price(a) - price(b) || byName(a, b),
    'price-desc': (a: (typeof items)[number], b: (typeof items)[number]) => (price(b) === Infinity ? -1 : price(a) === Infinity ? 1 : price(b) - price(a)) || byName(a, b),
    name: byName,
  };
  items.sort(sorters[q.sort]);
  const start = (q.page - 1) * q.pageSize;
  return { items: items.slice(start, start + q.pageSize).map(({ createdAt: _c, ...x }) => x), page: q.page, pageSize: q.pageSize, total: items.length };
}

export async function getProduct(deps: Deps, slug: string) {
  const p = await deps.db.product.findUnique({
    where: { slug },
    include: {
      category: { select: { slug: true } },
      variants: { where: { isActive: true }, orderBy: { price: 'asc' }, select: { id: true, sku: true, name: true, attributes: true, price: true, compareAtPrice: true, trackInventory: true } },
      images: { orderBy: { sortOrder: 'asc' }, include: { media: true } },
    },
  });
  if (!p || p.status !== 'ACTIVE') return null;
  const content = await deps.mongo.db.collection(collections.productContent).findOne({ productId: p.id, locale: 'en' }, { projection: { _id: 0, productId: 0 } });
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    scientificName: p.scientificName,
    nativeName: p.nativeName,
    category: p.category.slug,
    categoryLabel: SHOP_CATEGORIES[p.category.slug as keyof typeof SHOP_CATEGORIES] ?? p.category.slug,
    plantType: p.plantType,
    plantTypeLabel: p.plantType ? (PLANT_TYPES[p.plantType as keyof typeof PLANT_TYPES] ?? null) : null,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
    images: p.images.map((i) => imageView(deps, i, p.name)),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, name: v.name, attributes: v.attributes, price: money(v.price), compareAtPrice: v.compareAtPrice ? money(v.compareAtPrice) : null, trackInventory: v.trackInventory })),
    content: content ?? null,
  };
}

/** Live availability for variants (never cached). null = not stock-tracked (made to order / always available). */
export async function availability(deps: Pick<Deps, 'db'>, ids: string[]) {
  const vs = await deps.db.productVariant.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, trackInventory: true, inventory: { select: { onHand: true, reserved: true } }, product: { select: { status: true } } } });
  return vs.map((v) => {
    const sellable = v.isActive && v.product.status === 'ACTIVE';
    const available = v.trackInventory ? Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)) : null;
    return { variantId: v.id, available: sellable ? available : 0, inStock: sellable && (available === null || available > 0) };
  });
}
