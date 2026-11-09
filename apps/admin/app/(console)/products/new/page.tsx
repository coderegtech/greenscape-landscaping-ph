import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductEditor } from '@/components/product-editor';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'New product' };
export const dynamic = 'force-dynamic';

export default async function NewProduct() {
  const me = await getStaff();
  if (!me || !can(me, 'products.write')) redirect('/products');
  return (
    <div className="flex flex-col gap-6">
      <Link href="/products" className="self-start text-sm text-ink-2">Products</Link>
      <h2 className="text-3xl">New product</h2>
      <ProductEditor id={null} canWrite initial={{ name: '', slug: '', scientificName: '', nativeName: '', category: 'plants', plantType: '', status: 'DRAFT', isFeatured: false, isNew: true, isBestSeller: false, images: [], description: '', careInstructions: '', wateringFrequency: '', sizesNote: '' }} />
    </div>
  );
}
