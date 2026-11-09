import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { type Asset, MediaLibrary } from '@/components/media-library';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

const Page = z.object({ items: z.array(z.custom<Asset>()), total: z.number(), page: z.number(), pageSize: z.number() });

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'media.read')) redirect('/');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await api(`/v1/media?${new URLSearchParams({ page: String(page), pageSize: '48', ...(sp.q ? { q: sp.q } : {}) })}`, Page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (p: number) => `/media?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Media</h2>
        <form method="get" className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">Search media</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Alt text or file name" className="h-10 w-64 border border-rule-strong bg-paper-3 px-3 text-sm" />
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Search</button>
        </form>
      </div>
      <MediaLibrary key={`${sp.q ?? ''}-${page}`} initial={data.items} canWrite={can(me, 'media.write')} canDelete={can(me, 'media.write')} />
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
          {page > 1 && <Link href={link(page - 1)}>Previous</Link>}
          <span className="tabular text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
