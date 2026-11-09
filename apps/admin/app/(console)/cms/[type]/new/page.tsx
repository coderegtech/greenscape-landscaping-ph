import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { NewDocForm } from '@/components/new-doc-form';
import { CONTENT_TYPES, isTypeKey } from '@/lib/content-types';
import { can, getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return { title: isTypeKey(type) ? `New ${CONTENT_TYPES[type].singular}` : 'New' };
}

export default async function NewDoc({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isTypeKey(type)) notFound();
  const me = await getStaff();
  if (!me || !can(me, 'cms.write')) redirect(`/cms/${type}`);
  return <NewDocForm type={type} />;
}
