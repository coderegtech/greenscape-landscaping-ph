import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ModerateButtons } from '@/components/moderate-buttons';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Testimonials' };
export const dynamic = 'force-dynamic';

const STATUSES = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' } as const;
const Item = z.object({ id: z.string(), name: z.string(), role: z.string().nullish(), projectType: z.string().nullish(), rating: z.number(), text: z.string(), status: z.enum(['pending', 'approved', 'rejected']), createdAt: z.string() });
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
const tabClass = 'inline-flex h-9 items-center border-b-2 px-3 text-sm font-medium no-underline border-transparent text-ink-2 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:text-ink';

export default async function TestimonialsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'testimonials.moderate')) redirect('/');
  const sp = await searchParams;
  const status = (Object.keys(STATUSES) as (keyof typeof STATUSES)[]).find((s) => s === sp.status) ?? 'pending';
  const items = await api(`/v1/cms-admin/collections/testimonials?status=${status}`, z.array(Item));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Testimonials</h2>
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b border-rule">
        {Object.entries(STATUSES).map(([s, l]) => <Link key={s} href={`/cms/testimonials?status=${s}`} className={tabClass} aria-current={status === s ? 'page' : undefined}>{l}</Link>)}
      </nav>
      {items.length ? (
        <ul className="flex max-w-3xl flex-col divide-y divide-rule border-y border-rule">
          {items.map((t) => (
            <li key={t.id} className="flex flex-col gap-3 py-5">
              <blockquote className="text-ink">{t.text}</blockquote>
              <p className="text-sm text-ink-2">
                {t.name}{t.role ? `, ${t.role}` : ''}{t.projectType ? ` (${t.projectType})` : ''}
                <span className="ml-3 tabular text-muted">{t.rating} of 5, {fmt(t.createdAt)}</span>
              </p>
              <ModerateButtons id={t.id} status={t.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">No {STATUSES[status].toLowerCase()} testimonials.</p>
      )}
    </div>
  );
}
