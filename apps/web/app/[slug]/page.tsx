import { notFound } from 'next/navigation';
import { CmsPageView, pageMetadata } from '@/lib/page';

// Pages created in the CMS. Fixed routes (/about, /privacy, …) win over this one; pages render on first request (ISR).
export const revalidate = 300;
export const generateStaticParams = () => [];

const valid = (slug: string) => slug !== 'home' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return valid(slug) ? pageMetadata(slug, `/${slug}`) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!valid(slug)) notFound();
  return <CmsPageView slug={slug} />;
}
