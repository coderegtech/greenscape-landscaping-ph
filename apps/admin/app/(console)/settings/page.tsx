import { api } from '@greenscape/auth/api';
import { HealthResponse, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NotificationsForm } from '@/components/notifications-form';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

const Notify = z.object({ saved: z.record(z.string(), z.array(z.string())).nullable(), effective: z.record(z.string(), z.array(z.string())), kinds: z.record(z.string(), z.string()) });

export default async function SettingsPage() {
  const me = await getStaff();
  if (!me || !can(me, 'settings.read')) redirect('/');
  const [n, health] = await Promise.all([api('/v1/admin/settings/notifications', Notify), api('/v1/health', HealthResponse).catch(() => null)]);
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <h2 className="text-3xl">Settings</h2>
      <section aria-labelledby="where" className="flex flex-col gap-3">
        <h3 id="where" className="text-xl">Elsewhere</h3>
        <ul className="flex flex-col gap-1">
          <li><Link href="/settings/delivery">Delivery areas and fees</Link></li>
          {can(me, 'cms.read') && <li><Link href="/cms/site">Company details and menus</Link></li>}
          {can(me, 'users.read') && <li><Link href="/users">Users and roles</Link></li>}
          {can(me, 'leave.read') && <li><Link href="/leave/settings">Leave types and holidays</Link></li>}
        </ul>
      </section>
      <section aria-labelledby="notify" className="flex flex-col gap-3">
        <h3 id="notify" className="text-xl">Who gets emails</h3>
        <p className="text-sm text-ink-2">One address per line. Leave a box empty to use the default shown under it.</p>
        <NotificationsForm saved={n.saved} effective={n.effective} kinds={n.kinds} canManage={can(me, 'settings.manage')} />
      </section>
      <section aria-labelledby="status" className="flex flex-col gap-2 text-sm">
        <h3 id="status" className="text-xl">System</h3>
        {health ? <p className="text-ink-2">Version {health.version}, API {health.status}{Object.entries(health.checks).map(([k, c]) => `, ${k} ${c.ok ? 'ok' : 'down'}`).join('')}. Caches refresh by themselves when content changes.</p> : <p className="text-danger">API unreachable</p>}
      </section>
    </div>
  );
}
