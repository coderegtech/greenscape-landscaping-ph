import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Assistant chat' };
export const dynamic = 'force-dynamic';

const Chat = z.object({
  id: z.string(), title: z.string(), status: z.string(), customer: z.string(), email: z.string(),
  messages: z.array(z.object({ id: z.string(), role: z.string(), content: z.string(), provider: z.string().nullable(), model: z.string().nullable(), inputTokens: z.number().nullable(), outputTokens: z.number().nullable(), error: z.string().nullable(), createdAt: z.string() })),
});

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'assistant.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await api(`/v1/admin/assistant/conversations/${id}`, Chat).catch(() => null);
  if (!c) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/assistant/conversations" className="text-sm">All chats</Link>
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl">{c.title}</h2>
        <p className="text-ink-2">{c.customer} ({c.email}){c.status === 'escalated' ? '. Passed to a person: reply in Messages.' : ''}</p>
      </div>
      <ol className="flex flex-col gap-3" data-testid="assistant-transcript">
        {c.messages.map((m) => (
          <li key={m.id} className={`flex flex-col gap-1 border-l-2 pl-4 ${m.role === 'user' ? 'border-signal' : 'border-rule'}`}>
            <span className="text-sm text-ink-2">
              {m.role === 'user' ? 'Customer' : 'Assistant'}, {when(m.createdAt)}
              {m.role === 'assistant' && m.model ? `, ${m.provider}/${m.model}` : ''}
              {m.inputTokens != null ? `, ${m.inputTokens} in / ${m.outputTokens ?? 0} out tokens` : ''}
              {m.error ? `, ${m.error}` : ''}
            </span>
            <p className="whitespace-pre-wrap text-base text-ink">{m.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
