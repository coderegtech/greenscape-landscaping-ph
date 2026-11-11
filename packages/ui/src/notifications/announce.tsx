'use client';
import { useState } from 'react';
import { Button } from '../components/button';
import { Notice } from '../form';
import { useNotifications } from './provider';

const AUDIENCES = [
  { value: 'staff', label: 'All staff (admin app)', app: 'admin', roles: undefined },
  { value: 'customers', label: 'Everyone with a website account', app: 'web', roles: undefined },
  { value: 'customer-role', label: 'Customers only', app: 'web', roles: ['customer'] },
  { value: 'employees', label: 'Employees (staff page)', app: 'web', roles: ['employee'] },
  { value: 'ecommerce', label: 'Shop team', app: 'admin', roles: ['ecommerce_manager', 'inventory_staff'] },
  { value: 'hr', label: 'HR team', app: 'admin', roles: ['hr_manager'] },
] as const;

const field = 'w-full border border-muted bg-paper-2 px-3 py-2 text-base text-ink';

/** Send an announcement to a chosen audience. The API enforces `notifications.broadcast`; this form is only shown to people who hold it. */
export function AnnouncementForm() {
  const { call } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const a = AUDIENCES.find((x) => x.value === f.get('audience'))!;
    setBusy(true);
    setResult(null);
    try {
      const r = await call<{ recipients: number }>('/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title: f.get('title'), message: f.get('message'), app: a.app, roles: a.roles, priority: f.get('priority'), href: (f.get('href') as string) || undefined }),
      });
      setResult({ tone: 'success', text: `Sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.` });
      form.reset();
    } catch (err) {
      setResult({ tone: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <p className="text-base text-ink-2">Shows in the notification bell, and as a phone or desktop alert for anyone who turned alerts on. It cannot be unsent, so check the wording.</p>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">To
        <select name="audience" className={field} defaultValue="staff">{AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">Title
        <input name="title" required maxLength={100} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">Message
        <textarea name="message" required maxLength={400} rows={3} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Opens page (optional)
          <input name="href" placeholder="/orders" pattern="/[\w\-/?=&%.#]*" title="A page on the site, such as /orders" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">Importance
          <select name="priority" className={field} defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">Important</option><option value="URGENT">Urgent</option></select>
        </label>
      </div>
      <div role="status" className="min-h-6">{result && <Notice tone={result.tone}>{result.text}</Notice>}</div>
      <Button type="submit" loading={busy} className="self-start">Send announcement</Button>
    </form>
  );
}
