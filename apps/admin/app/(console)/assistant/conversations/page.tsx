import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { when } from '@/lib/format';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Assistant chats and usage' };
export const dynamic = 'force-dynamic';

const Usage = z.object({
  days: z.array(z.object({ day: z.string(), messages: z.number(), replies: z.number(), errors: z.number(), inputTokens: z.number(), outputTokens: z.number(), users: z.number() })),
  errors: z.array(z.object({ id: z.string(), createdAt: z.string(), provider: z.string().nullable(), model: z.string().nullable(), error: z.string().nullable() })),
});
const List = z.object({ total: z.number(), page: z.number(), pageSize: z.number(), rows: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), updatedAt: z.string(), customer: z.string(), email: z.string(), messages: z.number() })) });
const n = (x: number) => x.toLocaleString('en-PH');
const th = 'border-b border-rule px-3 py-2 text-left text-sm font-medium';
const td = 'border-b border-rule px-3 py-2 text-sm';

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'assistant.read')) redirect('/');
  const q = await searchParams;
  const status = q.status === 'escalated' ? 'escalated' : undefined;
  const page = Math.max(1, Number(q.page) || 1);
  const [usage, list] = await Promise.all([
    api('/v1/admin/assistant/usage', Usage),
    api(`/v1/admin/assistant/conversations?page=${page}${status ? `&status=${status}` : ''}`, List),
  ]);
  const total = usage.days.reduce((s, d) => ({ messages: s.messages + d.messages, errors: s.errors + d.errors, input: s.input + d.inputTokens, output: s.output + d.outputTokens }), { messages: 0, errors: 0, input: 0, output: 0 });
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (p: number, s = status) => `/assistant/conversations?page=${p}${s ? `&status=${s}` : ''}`;

  return (
    <div className="flex max-w-5xl flex-col gap-10">
      <h2 className="text-3xl">Assistant chats and usage</h2>

      <section aria-labelledby="usage" className="flex flex-col gap-4">
        <h3 id="usage" className="text-xl">Last 30 days</h3>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="assistant-totals">
          {[['Customer messages', total.messages], ['Tokens in', total.input], ['Tokens out', total.output], ['Failed replies', total.errors]].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 border border-rule p-4">
              <dt className="text-sm text-ink-2">{label}</dt>
              <dd className="text-2xl text-ink tabular-nums">{n(value as number)}</dd>
            </div>
          ))}
        </dl>
        {usage.days.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <caption className="sr-only">Assistant use per day (Manila time)</caption>
              <thead><tr><th className={th}>Day</th><th className={th}>People</th><th className={th}>Messages</th><th className={th}>Tokens in</th><th className={th}>Tokens out</th><th className={th}>Failed</th></tr></thead>
              <tbody>
                {usage.days.slice().reverse().map((d) => (
                  <tr key={d.day}><td className={td}>{d.day}</td><td className={`${td} tabular-nums`}>{n(d.users)}</td><td className={`${td} tabular-nums`}>{n(d.messages)}</td><td className={`${td} tabular-nums`}>{n(d.inputTokens)}</td><td className={`${td} tabular-nums`}>{n(d.outputTokens)}</td><td className={`${td} tabular-nums`}>{n(d.errors)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {usage.errors.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer">Recent errors ({usage.errors.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {usage.errors.map((e) => <li key={e.id} className="text-ink-2">{when(e.createdAt)}: {e.provider}/{e.model}: {e.error}</li>)}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="chats" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 id="chats" className="text-xl">Chats</h3>
          <nav aria-label="Filter chats" className="flex gap-4 text-sm">
            <Link href={href(1, undefined)} aria-current={!status ? 'page' : undefined}>All</Link>
            <Link href={href(1, 'escalated')} aria-current={status ? 'page' : undefined}>Passed to a person</Link>
          </nav>
        </div>
        <p className="text-sm text-ink-2">Chats are customers’ personal data. Opening one is recorded in the audit log.</p>
        {list.rows.length ? (
          <ul className="border-t border-rule" data-testid="assistant-chats">
            {list.rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-rule py-3">
                <div className="flex min-w-0 flex-col">
                  <Link href={`/assistant/conversations/${c.id}`} className="truncate text-base text-ink">{c.title}</Link>
                  <span className="text-sm text-ink-2">{c.customer}, {c.messages} messages, {when(c.updatedAt)}{c.status === 'escalated' ? ', passed to a person' : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No chats yet.</p>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="flex gap-4 text-sm">
            {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
            <span>Page {page} of {pages}</span>
            {page < pages && <Link href={href(page + 1)}>Next</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
