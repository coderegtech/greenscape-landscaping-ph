import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ProductEditor } from '@/components/product-editor';
import { type AdminVariant, VariantsEditor } from '@/components/variants-editor';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Product' };
export const dynamic = 'force-dynamic';

const Product = z.object({
  id: z.string(), slug: z.string(), name: z.string(), scientificName: z.string().nullable(), nativeName: z.string().nullable(), category: z.string(), plantType: z.string().nullable(), status: z.string(),
  isFeatured: z.boolean(), isNew: z.boolean(), isBestSeller: z.boolean(), legacyId: z.string().nullable(),
  images: z.array(z.object({ mediaId: z.string(), url: z.string(), alt: z.string() })),
  variants: z.array(z.custom<AdminVariant>()),
  description: z.string(), careInstructions: z.string(), wateringFrequency: z.string(), sizesNote: z.string(),
});

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'products.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await api(`/v1/shop-admin/products/${id}`, Product).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const web = process.env.WEB_URL ?? 'http://localhost:3000';
  return (
    <div className="flex flex-col gap-8">
      <Link href="/products" className="self-start text-sm text-ink-2">Products</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <h2 className="text-3xl">{p.name}</h2>
        {p.status === 'ACTIVE' && <a href={`${web}/shop/${p.slug}`} target="_blank" rel="noreferrer" className="text-sm">View in the shop</a>}
      </div>
      <VariantsEditor productId={p.id} slug={p.slug} variants={p.variants} canWrite={can(me, 'products.write')} canStock={can(me, 'inventory.read')} />
      <ProductEditor id={p.id} canWrite={can(me, 'products.write')} initial={{ ...p, scientificName: p.scientificName ?? '', nativeName: p.nativeName ?? '', plantType: p.plantType ?? '' }} />
    </div>
  );
}
