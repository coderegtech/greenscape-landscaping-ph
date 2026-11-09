import { api } from '@greenscape/auth/api';
import { Badge } from '@greenscape/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@greenscape/ui/components/table';
import { QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, QUOTE_SERVICES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Quotations' };
export const dynamic = 'force-dynamic';

const Row = z.object({ id: z.string(), number: z.string(), name: z.string(), email: z.string(), phone: z.string(), services: z.array(z.string()), projectLocation: z.string().nullable(), status: z.enum(QUOTATION_STATUSES), submittedAt: z.string(), _count: z.object({ attachments: z.number() }) });
const Page = z.object({ items: z.array(Row), page: z.number(), pageSize: z.number(), total: z.number(), counts: z.record(z.string(), z.number()) });

const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const tabClass = 'inline-flex h-9 items-center gap-2 border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'quotations.read')) redirect('/');
  const sp = await searchParams;
  const status = QUOTATION_STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Number(sp.page) || 1);
  const qs = new URLSearchParams({ page: String(page), pageSize: '25', ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}) });
  const data = await api(`/v1/quotations?${qs}`, Page);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (o: Record<string, string | undefined>) => `/quotations?${new URLSearchParams(Object.entries({ status, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl">Quotations</h2>
        <form method="get" className="flex gap-2" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="q" className="sr-only">Search quotations</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Name, email, number, place" className="h-10 w-64 border border-rule-strong bg-paper-3 px-3 text-sm" />
          <button type="submit" className="h-10 rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal">Search</button>
        </form>
      </div>
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href={link({ status: undefined, page: undefined })} className={tabClass} aria-current={!status ? 'page' : undefined}>Open</Link>
        {QUOTATION_STATUSES.map((s) => (
          <Link key={s} href={link({ status: s, page: undefined })} className={tabClass} aria-current={status === s ? 'page' : undefined}>
            {QUOTATION_STATUS_LABELS[s]} <span className="tabular text-xs text-muted">{data.counts[s] ?? 0}</span>
          </Link>
        ))}
      </nav>
      {data.items.length ? (
        <Table label="Quotation requests">
          <TableHeader>
            <TableRow className="border-rule hover:bg-transparent">
              <TableHead className="text-muted">Reference</TableHead>
              <TableHead className="text-muted">From</TableHead>
              <TableHead className="text-muted">Services</TableHead>
              <TableHead className="text-muted">Location</TableHead>
              <TableHead className="text-muted">Received</TableHead>
              <TableHead className="text-muted">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((q) => (
              <TableRow key={q.id} className="border-rule hover:bg-paper-2">
                <TableCell className="tabular font-medium">
                  <Link href={`/quotations/${q.id}`} className="text-ink">{q.number}</Link>
                </TableCell>
                <TableCell>
                  <span className="block text-ink">{q.name}</span>
                  <span className="text-xs text-muted">{q.phone}</span>
                </TableCell>
                <TableCell className="max-w-56 truncate">{q.services.map((s) => QUOTE_SERVICES[s as keyof typeof QUOTE_SERVICES] ?? s).join(', ')}</TableCell>
                <TableCell className="max-w-48 truncate">{q.projectLocation ?? ''}</TableCell>
                <TableCell className="tabular whitespace-nowrap">{fmt(q.submittedAt)}</TableCell>
                <TableCell>
                  <Badge variant={q.status === 'NEW' ? 'signal' : 'outline'}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-base text-ink-2">No quotation requests {status ? `marked “${QUOTATION_STATUS_LABELS[status]}”` : 'open'}{sp.q ? ` matching “${sp.q}”` : ''}.</p>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link({ page: String(page - 1) })}>Previous</Link>}
          <span className="tabular text-muted">Page {page} of {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
