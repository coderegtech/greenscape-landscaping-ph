// Seeds the shop from the public catalogue extract (scripts/migrate/data/products-public.json, see fetch-public-products.mjs):
//   • 5 categories; Palawan delivery zones created INACTIVE with no fee (the business sets real fees in admin);
//   • 97 products with their photos copied into Supabase Storage (≤1600 px WebP + blur placeholder) and their
//     description / care text in MongoDB productContent.
// The old site has no prices or stock, so no variants are created: products show "price on request" until staff add
// a priced variant. Idempotent and create-only: re-running never overwrites anything edited in the admin.
// Usage: pnpm shop:seed
import fs from 'node:fs';
import path from 'node:path';
import { ProductContent, collections, connectContentDb } from '@greenscape/content';
import { createPrismaClient } from '@greenscape/database';
import { createStorage } from '@greenscape/storage';
import { PLANT_TYPES, SHOP_CATEGORIES } from '@greenscape/validation';
import { importImage } from './lib/images.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env')); } catch { /* CI env */ }

const { products } = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'data/products-public.json'), 'utf8')) as { products: Legacy[] };
interface Legacy {
  id: string; createTime: string; name: string; scientificName?: string | null; nativeName?: string | null; category?: string; plantType?: string | null;
  sizes?: string[]; colors?: string[]; dimension?: string | null; wateringFrequency?: string | null; careInstructions?: string | null; description?: string | null;
  isNew?: boolean; isFeatured?: boolean; isBestSeller?: boolean; imageUrl?: string | null; imageUrls?: string[];
}

const PALAWAN = ['Puerto Princesa City', 'Aborlan', 'Agutaya', 'Araceli', 'Balabac', 'Bataraza', "Brooke's Point", 'Busuanga', 'Cagayancillo', 'Coron', 'Culion', 'Cuyo', 'Dumaran', 'El Nido', 'Kalayaan', 'Linapacan', 'Magsaysay', 'Narra', 'Quezon', 'Rizal', 'Roxas', 'San Vicente', 'Sofronio Española', 'Taytay'];

const db = createPrismaClient(process.env.DATABASE_URL!);
const mongo = await connectContentDb(process.env.MONGODB_URL!, process.env.MONGODB_DB ?? 'greenscape');
const storage = createStorage(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

const slugify = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80).replace(/-$/, '');
const clean = (s?: string | null) => (s ?? '').replace(/\r/g, '').trim();
const rich = (src: string) => ({ type: 'doc' as const, content: src.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => ({ type: 'paragraph', content: p.split('\n').flatMap((line, i) => (i ? [{ type: 'hardBreak' }, { type: 'text', text: line }] : [{ type: 'text', text: line }])) })) });

// ── categories and zones ──
const cats = new Map<string, string>();
for (const [i, [slug, name]] of Object.entries(SHOP_CATEGORIES).entries()) {
  const c = await db.category.upsert({ where: { slug }, create: { slug, name, sortOrder: i }, update: {} });
  cats.set(slug, c.id);
}
for (const [i, name] of PALAWAN.entries()) await db.deliveryZone.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });

// ── products ──
const used = new Set((await db.product.findMany({ select: { slug: true } })).map((p) => p.slug));
let created = 0, images = 0;
const failed: string[] = [];
const content = mongo.db.collection(collections.productContent);
for (const lp of products) {
  const name = clean(lp.name);
  if (!name) continue;
  let product = await db.product.findUnique({ where: { legacyId: lp.id } });
  if (!product) {
    let slug = slugify(name) || `product-${lp.id.toLowerCase()}`;
    for (let n = 2; used.has(slug); n++) slug = `${slugify(name)}-${n}`;
    used.add(slug);
    const category = cats.get(lp.category ?? '') ?? cats.get('accessories')!;
    product = await db.product.create({
      data: {
        slug, name, legacyId: lp.id, categoryId: category, status: 'ACTIVE',
        scientificName: clean(lp.scientificName) || null, nativeName: clean(lp.nativeName) || null,
        plantType: lp.plantType && lp.plantType in PLANT_TYPES ? lp.plantType : null,
        isNew: !!lp.isNew, isFeatured: !!lp.isFeatured, isBestSeller: !!lp.isBestSeller,
        createdAt: new Date(lp.createTime),
      },
    });
    created++;
  }

  if (!(await db.productImage.count({ where: { productId: product.id } }))) {
    const urls = [...new Set([...(lp.imageUrls ?? []), ...(lp.imageUrl ? [lp.imageUrl] : [])])].slice(0, 8);
    let n = 0;
    for (const [i, url] of urls.entries()) {
      try {
        const { asset: m } = await importImage(db, storage, url, { path: `products/legacy/${lp.id}-${i}.webp`, alt: name, maxPx: 1600 });
        await db.productImage.create({ data: { productId: product.id, mediaId: m.id, alt: name, sortOrder: n++ } });
        images++;
      } catch (e) {
        failed.push(`${name}: ${(e as Error).message}`);
      }
    }
  }

  const sizes = (lp.sizes ?? []).map(clean).filter(Boolean).join('; ');
  const doc = ProductContent.parse({
    productId: product.id, locale: 'en',
    description: rich(clean(lp.description)),
    ...(clean(lp.careInstructions) ? { careInstructions: rich(clean(lp.careInstructions)) } : {}),
    ...(clean(lp.wateringFrequency) ? { wateringFrequency: clean(lp.wateringFrequency).slice(0, 120) } : {}),
    ...(sizes ? { sizesNote: sizes.slice(0, 200) } : {}),
    seo: {}, updatedAt: new Date(),
  });
  const { productId, locale, ...rest } = doc;
  await content.updateOne({ productId, locale }, { $setOnInsert: rest }, { upsert: true });
}

console.log(`categories ${cats.size}, zones ${PALAWAN.length} (inactive until a fee is set), products ${products.length} (${created} new), images imported ${images}`);
if (failed.length) console.log(`image failures (${failed.length}):\n  ${failed.join('\n  ')}`);
await db.$disconnect();
await mongo.client.close();
