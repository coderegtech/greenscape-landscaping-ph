import { api } from '@greenscape/auth/api';
import { SelfieSettings, z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HolidaysEditor, LeaveTypesEditor } from '@/components/leave-settings';
import { SelfieSettingsForm } from '@/components/selfie-settings';
import { manilaToday } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Leave and attendance settings' };
export const dynamic = 'force-dynamic';

export default async function LeaveSettings({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'leave.read')) redirect('/');
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? '') ? Number(sp.year) : Number(manilaToday().slice(0, 4));
  const [types, holidays, selfie] = await Promise.all([
    api('/v1/hr/leave-types', z.array(z.object({ id: z.string(), key: z.string(), name: z.string(), defaultDaysPerYear: z.number() }))),
    can(me, 'attendance.read') ? api(`/v1/hr/holidays?year=${year}`, z.array(z.object({ id: z.string(), date: z.string(), name: z.string(), type: z.string() }))) : Promise.resolve([]),
    can(me, 'attendance.read') ? api('/v1/hr/settings/selfie', SelfieSettings) : Promise.resolve(null),
  ]);
  const canManage = can(me, 'employees.manage');
  return (
    <div className="flex flex-col gap-10">
      <Link href="/leave" className="self-start text-sm text-ink-2">Leave</Link>
      <section aria-labelledby="types" className="flex flex-col gap-4">
        <h2 id="types" className="text-3xl">Types of leave</h2>
        <p className="max-w-2xl text-ink-2">Days per year are the starting allowance for each employee; adjust individuals under Balances. Service incentive leave starts at the legal minimum of 5 days a year (due after one year of service); confirm the company’s other allowances before relying on them.</p>
        <LeaveTypesEditor types={types} canManage={canManage} />
      </section>
      <section aria-labelledby="hol" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="hol" className="text-3xl">Holidays {year}</h2>
          <div className="flex gap-3 text-sm"><Link href={`/leave/settings?year=${year - 1}`}>{year - 1}</Link><Link href={`/leave/settings?year=${year + 1}`}>{year + 1}</Link></div>
        </div>
        <p className="max-w-2xl text-ink-2">Enter the dates from the year’s official proclamation. Holidays are not counted as leave days, and scheduled staff are marked “Holiday” instead of absent (except on special working days).</p>
        <HolidaysEditor holidays={holidays} canManage={canManage} />
      </section>
      {selfie && (
        <section aria-labelledby="selfie" className="flex flex-col gap-4">
          <h2 id="selfie" className="text-3xl">Clock-in selfie</h2>
          <SelfieSettingsForm initial={selfie} canManage={canManage} />
        </section>
      )}
    </div>
  );
}
