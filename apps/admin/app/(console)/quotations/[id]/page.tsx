import { api } from '@greenscape/auth/api';
import { Button } from '@greenscape/ui/components/button';
import { BEST_TIMES, BUDGETS, PROPERTY_TYPES, QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, QUOTE_SERVICES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, getStaff } from '@/lib/session';
import { addNote, setStatus } from './actions';

export const metadata: Metadata = { title: 'Quotation' };
export const dynamic = 'force-dynamic';

const Detail = z.object({
  id: z.string(), number: z.string(), name: z.string(), email: z.string(), phone: z.string(), services: z.array(z.string()),
  projectLocation: z.string().nullable(), propertyType: z.string().nullable(), areaSqm: z.number().nullable(), budgetRange: z.string().nullable(),
  preferredDate: z.string().nullable(), bestTimeToTalk: z.string().nullable(), details: z.string(), status: z.enum(QUOTATION_STATUSES), submittedAt: z.string(),
  customer: z.object({ id: z.string(), userId: z.string().nullable() }).nullable(),
  attachments: z.array(z.object({ id: z.string(), mimeType: z.string(), sizeBytes: z.number(), url: z.string() })),
  notes: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.string(), author: z.object({ email: z.string(), displayName: z.string().nullable() }).nullable() })),
});

const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const lbl = (m: Record<string, string>, k: string | null) => (k ? (m[k] ?? k) : 'Not given');

export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'quotations.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await api(`/v1/quotations/${id}`, Detail).catch(() => null);
  if (!q) notFound();
  const manage = can(me, 'quotations.manage');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/quotations" className="text-sm text-muted">Quotations</Link>
        <h2 className="text-3xl"><span className="figure">{q.number}</span> {q.name}</h2>
        <p className="text-sm text-muted">Received {fmt(q.submittedAt)}{q.customer?.userId ? ', from a signed-in customer' : ''}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="request" className="flex flex-col gap-6 border border-rule bg-paper-3 p-6">
          <h3 id="request" className="font-body text-sm font-bold text-ink">Request</h3>
          <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Contact</dt>
            <dd className="text-ink"><a href={`tel:${q.phone}`}>{q.phone}</a>, <a href={`mailto:${q.email}`}>{q.email}</a></dd>
            <dt className="text-muted">Best time to call</dt><dd className="text-ink">{lbl(BEST_TIMES, q.bestTimeToTalk)}</dd>
            <dt className="text-muted">Services</dt><dd className="text-ink">{q.services.map((s) => lbl(QUOTE_SERVICES, s)).join(', ')}</dd>
            <dt className="text-muted">Property</dt><dd className="text-ink">{lbl(PROPERTY_TYPES, q.propertyType)}{q.areaSqm ? `, about ${q.areaSqm} sqm` : ''}</dd>
            <dt className="text-muted">Location</dt><dd className="text-ink">{q.projectLocation ?? 'Not given'}</dd>
            <dt className="text-muted">Budget</dt><dd className="text-ink">{lbl(BUDGETS, q.budgetRange)}</dd>
            <dt className="text-muted">Preferred start</dt><dd className="text-ink">{q.preferredDate ? q.preferredDate.slice(0, 10) : 'Flexible'}</dd>
          </dl>
          <p className="whitespace-pre-wrap text-base text-ink">{q.details}</p>
          {q.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="font-body text-sm font-bold text-ink">Attachments</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {q.attachments.map((a, i) => (
                  <li key={a.id}>
                    <a href={a.url} rel="noopener" target="_blank">Attachment {i + 1} ({a.mimeType === 'application/pdf' ? 'PDF' : 'photo'}, {Math.round(a.sizeBytes / 1024)} KB)</a>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">Links expire after 5 minutes; reload the page for fresh ones.</p>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="status-h" className="flex flex-col gap-3">
            <h3 id="status-h" className="font-body text-sm font-bold text-ink">Status</h3>
            {manage ? (
              <form action={setStatus.bind(null, q.id)} className="flex gap-2">
                <label htmlFor="status" className="sr-only">Status</label>
                <select id="status" name="status" defaultValue={q.status} className="h-10 flex-1 border border-rule-strong bg-paper-3 px-3 text-sm">
                  {QUOTATION_STATUSES.map((s) => <option key={s} value={s}>{QUOTATION_STATUS_LABELS[s]}</option>)}
                </select>
                <Button type="submit" size="sm">Update</Button>
              </form>
            ) : (
              <p className="text-sm text-ink" data-testid="quote-status">{QUOTATION_STATUS_LABELS[q.status]}</p>
            )}
          </section>

          <section aria-labelledby="notes-h" className="flex flex-col gap-3">
            <h3 id="notes-h" className="font-body text-sm font-bold text-ink">Internal notes</h3>
            {manage && (
              <form action={addNote.bind(null, q.id)} className="flex flex-col gap-2">
                <label htmlFor="note" className="sr-only">New note</label>
                <textarea id="note" name="body" required maxLength={4000} rows={3} className="border border-rule-strong bg-paper-3 p-3 text-sm" placeholder="Called, site visit booked for Tuesday…" />
                <Button type="submit" size="sm" variant="secondary" className="self-start">Add note</Button>
              </form>
            )}
            <ul className="flex flex-col border-t border-rule text-sm">
              {q.notes.map((n) => (
                <li key={n.id} className="border-b border-rule py-3">
                  <p className="whitespace-pre-wrap text-ink">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{n.author?.displayName ?? n.author?.email ?? 'Staff'}, {fmt(n.createdAt)}</p>
                </li>
              ))}
              {!q.notes.length && <li className="py-3 text-muted">No notes yet.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
