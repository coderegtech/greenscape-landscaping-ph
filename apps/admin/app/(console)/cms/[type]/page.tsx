import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ImportButton } from '@/components/import-button';
import { CONTENT_TYPES, isTypeKey } from '@/lib/content-types';
import { can, getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

const STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
const LABEL: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', archived: 'Archived' };
const Summary = z.object({ slug: z.string(), title: z.string(), status: z.string(), publishAt: z.string().nullable(), updatedAt: z.string().nullish(), hasUnpublishedChanges: z.boolean() });
const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const tabClass = 'inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return { title: isTypeKey(type) ? CONTENT_TYPES[type].label : 'Content' };
}

export default async function ContentList({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { type } = await params;
  if (!isTypeKey(type)) notFound();
  const me = await getStaff();
  if (!me || !can(me, 'cms.read')) redirect('/');
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const def = CONTENT_TYPES[type];
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}) });
  const items = await api(`/v1/cms-admin/${type}?${qs}`, z.array(Summary));
  const link = (s?: string) => `/cms/${type}?${new URLSearchParams(Object.entries({ status: s, q: sp.q }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">{def.label}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex gap-2" role="search">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="q" className="sr-only">Search {def.label.toLowerCase()}</label>
            <input id="q" name="q" defaultValue={sp.q} placeholder="Title or address" className="h-10 w-56 border border-rule-strong bg-paper-3 px-3 text-sm" />
            <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Search</button>
          </form>
          {can(me, 'cms.write') && (
            <>
              <ImportButton type={type} />
              <Link href={`/cms/${type}/new`} className="inline-flex h-10 items-center rounded-pill bg-signal px-4 text-sm font-bold text-signal-ink no-underline">New {def.singular}</Link>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href={link()} className={tabClass} aria-current={!status ? 'page' : undefined}>All current</Link>
        {STATUSES.map((s) => <Link key={s} href={link(s)} className={tabClass} aria-current={status === s ? 'page' : undefined}>{LABEL[s]}</Link>)}
      </nav>
      {items.length ? (
        <Table label={def.label}>
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Title</TableHead>
              <TableHead className="text-muted">Address</TableHead>
              <TableHead className="text-muted">Status</TableHead>
              <TableHead className="text-muted">Last edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.slug} className="border-rule hover:bg-paper-2">
                <TableCell className="max-w-96 truncate font-medium">
                  <Link href={`/cms/${type}/${d.slug}`} className="text-ink">{d.title}</Link>
                </TableCell>
                <TableCell className="tabular text-ink-2">{def.publicPath(d.slug)}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={d.status === 'published' ? 'signal' : 'outline'}>{LABEL[d.status] ?? d.status}</Badge>
                    {d.hasUnpublishedChanges && <span className="text-xs text-muted">unpublished edits</span>}
                    {d.status === 'scheduled' && d.publishAt && <span className="text-xs text-muted">{fmt(d.publishAt)}</span>}
                  </span>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-ink-2">{d.updatedAt ? fmt(d.updatedAt) : ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-ink-2">Nothing here{sp.q ? ` matching “${sp.q}”` : ''}.</p>
      )}
    </div>
  );
}
