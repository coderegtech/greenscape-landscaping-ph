import { api } from '@greenscape/auth/api';
import { INQUIRY_STATUSES, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ThreadReply } from '@/components/thread-reply';
import { tabClass, when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Contact form' };
export const dynamic = 'force-dynamic';

const Inquiry = z.object({ id: z.string(), name: z.string(), email: z.string(), phone: z.string().nullable(), subject: z.string().nullable(), body: z.string(), status: z.string(), statusLabel: z.string(), createdAt: z.string(), replies: z.array(z.object({ body: z.string(), sentAt: z.string() })) });

export default async function ContactInbox({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'messages.read')) redirect('/');
  const sp = await searchParams;
  const status = (Object.keys(INQUIRY_STATUSES) as (keyof typeof INQUIRY_STATUSES)[]).find((s) => s === sp.status) ?? 'new';
  const rows = await api(`/v1/admin/inquiries?status=${status}`, z.array(Inquiry));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Messages</h2>
      <nav aria-label="Messages" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href="/messages" className={tabClass}>Customer chat</Link>
        {Object.entries(INQUIRY_STATUSES).map(([k, l]) => <Link key={k} href={`/messages/contact?status=${k}`} className={tabClass} aria-current={status === k ? 'page' : undefined}>Contact form: {l.toLowerCase()}</Link>)}
      </nav>
      {rows.length ? (
        <ul className="flex max-w-3xl flex-col divide-y divide-rule border-y border-rule">
          {rows.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 py-5" data-testid="inquiry">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{i.name}{i.subject ? `: ${i.subject}` : ''}</span>
                <span className="text-xs text-muted">{when(i.createdAt)}</span>
              </div>
              <p className="text-sm text-ink-2"><a href={`mailto:${i.email}`}>{i.email}</a>{i.phone ? `, ${i.phone}` : ''}</p>
              <p className="whitespace-pre-wrap">{i.body}</p>
              {i.replies.map((r, n) => <p key={n} className="border-l-2 border-signal pl-3 text-sm whitespace-pre-wrap text-ink-2"><span className="block text-xs text-muted">Replied {when(r.sentAt)}</span>{r.body}</p>)}
              {can(me, 'messages.reply') && <ThreadReply id={i.id} status={i.status} kind="inquiry" />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">Nothing {INQUIRY_STATUSES[status].toLowerCase()}.</p>
      )}
    </div>
  );
}
