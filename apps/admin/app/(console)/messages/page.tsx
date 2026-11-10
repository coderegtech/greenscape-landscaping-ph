import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { tabClass, when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

const Conv = z.object({ id: z.string(), customer: z.string(), email: z.string(), unread: z.number(), lastMessageAt: z.string().nullable(), preview: z.string(), lastFromCustomer: z.boolean() });


export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'messages.read')) redirect('/');
  const status = (await searchParams).status === 'closed' ? 'closed' : 'open';
  const rows = await api(`/v1/admin/conversations?status=${status}`, z.array(Conv));
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl">Messages</h2>
      <nav aria-label="Messages" className="flex flex-wrap gap-1 border-b border-rule">
        <Link href="/messages" className={tabClass} aria-current={status === 'open' ? 'page' : undefined}>Customer chat</Link>
        <Link href="/messages?status=closed" className={tabClass} aria-current={status === 'closed' ? 'page' : undefined}>Closed chats</Link>
        <Link href="/messages/contact" className={tabClass}>Contact form</Link>
      </nav>
      {rows.length ? (
        <ul className="flex max-w-3xl flex-col border-t border-rule" aria-label="Conversations">
          {rows.map((c) => (
            <li key={c.id} className="relative flex flex-col gap-1 border-b border-rule py-3 hover:bg-paper-2">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/messages/${c.id}`} className={`text-ink no-underline after:absolute after:inset-0 ${c.unread ? 'font-bold' : ''}`}>{c.customer}</Link>
                <span className="text-xs text-muted">{c.lastMessageAt ? when(c.lastMessageAt) : ''}</span>
              </span>
              <span className="line-clamp-1 text-sm text-ink-2">{c.lastFromCustomer ? '' : 'You: '}{c.preview}</span>
              {c.unread > 0 && <span className="text-xs font-bold text-signal">{c.unread} unread</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">No {status} conversations. Signed-in customers write to you from the website’s Messages page.</p>
      )}
    </div>
  );
}
