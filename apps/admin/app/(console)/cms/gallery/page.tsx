import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CollectionManager } from '@/components/collection-manager';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Gallery' };
export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const me = await getStaff();
  if (!me || !can(me, 'cms.read')) redirect('/');
  const items = await api('/v1/cms-admin/collections/galleryItems', z.array(z.record(z.string(), z.unknown())));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Gallery</h2>
      <CollectionManager name="galleryItems" items={items} canWrite={can(me, 'cms.write')} />
    </div>
  );
}
