import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { type CmsDoc, ContentEditor } from '@/components/content-editor';
import { CONTENT_TYPES, isTypeKey } from '@/lib/content-types';
import { can, getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit' };

export default async function EditDoc({ params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  if (!isTypeKey(type) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  const me = await getStaff();
  if (!me || !can(me, 'cms.read')) redirect('/');
  const doc = await api(`/v1/cms-admin/${type}/${slug}`, z.custom<CmsDoc>((v) => !!v && typeof v === 'object')).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/cms/${type}`} className="self-start text-sm text-ink-2">{CONTENT_TYPES[type].label}</Link>
      {/* key: a rollback or reload remounts with the server copy */}
      <ContentEditor key={`${slug}-${doc.revision}`} type={type} doc={doc} canWrite={can(me, 'cms.write')} canPublish={can(me, 'cms.publish')} />
    </div>
  );
}
