import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import { MessageForm } from '@/components/message-form';
import { PageHeader } from '@/lib/page';

export const metadata: Metadata = { title: 'Messages', robots: { index: false } };
export const dynamic = 'force-dynamic';

const Thread = z.object({ messages: z.array(z.object({ id: z.string(), fromMe: z.boolean(), body: z.string(), at: z.string() })) });
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

export default async function MessagesPage() {
  const { messages } = await api('/v1/me/messages', Thread);
  return (
    <main id="main">
      <PageHeader title="Message us" lead="Ask about plants, orders or a project. We reply here and by email." />
      <section aria-label="Conversation" className="container-page flex max-w-[48rem] flex-col gap-8 pb-24">
        {messages.length > 0 && (
          <ol className="flex flex-col gap-3" data-testid="my-thread">
            {messages.map((m) => (
              <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 px-4 py-3 ${m.fromMe ? 'self-end bg-paper-3' : 'band-cream self-start'}`}>
                <span className="text-xs text-muted">{m.fromMe ? 'You' : 'Greenscape'}, {when(m.at)}</span>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
        <MessageForm />
      </section>
    </main>
  );
}
