import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { type Schedule, SchedulesEditor } from '@/components/schedules-editor';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Schedules' };
export const dynamic = 'force-dynamic';

export default async function SchedulesPage() {
  const me = await getStaff();
  if (!me || !can(me, 'employees.read')) redirect('/');
  const schedules = await api('/v1/hr/schedules', z.array(z.custom<Schedule>()));
  return (
    <div className="flex flex-col gap-6">
      <Link href="/employees" className="self-start text-sm text-ink-2">Employees</Link>
      <h2 className="text-3xl">Work schedules</h2>
      <p className="max-w-2xl text-ink-2">A day can have several blocks (morning and afternoon). A block that ends earlier than it starts runs past midnight. Lateness counts in full once it is past the grace minutes.</p>
      <SchedulesEditor schedules={schedules} canManage={can(me, 'employees.manage')} />
    </div>
  );
}
