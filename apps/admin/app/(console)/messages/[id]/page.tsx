import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ThreadReply } from '@/components/thread-reply';
import { when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Conversation' };
export const dynamic = 'force-dynamic';

const Thread = z.object({ id: z.string(), status: z.string(), customer: z.object({ name: z.string(), email: z.string() }), messages: z.array(z.object({ id: z.string(), fromCustomer: z.boolean(), body: z.string(), at: z.string(), readAt: z.string().nullable() })) });

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'messages.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await api(`/v1/admin/conversations/${id}`, Thread).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/messages" className="self-start text-sm text-ink-2">Messages</Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
        <h2 className="text-3xl">{t.customer.name}</h2>
        <a href={`mailto:${t.customer.email}`} className="text-sm">{t.customer.email}</a>
      </div>
      <ol className="flex flex-col gap-3" aria-label="Messages" data-testid="thread">
        {t.messages.map((m) => (
          <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 border px-3 py-2 ${m.fromCustomer ? 'self-start border-rule bg-paper-3' : 'self-end border-signal/30 bg-paper-2'}`}>
            <span className="text-xs text-muted">{m.fromCustomer ? t.customer.name : 'Greenscape'}, {when(m.at)}{!m.fromCustomer && m.readAt ? ', read' : ''}</span>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ol>
      {can(me, 'messages.reply') && <ThreadReply id={t.id} status={t.status} />}
    </div>
  );
}
