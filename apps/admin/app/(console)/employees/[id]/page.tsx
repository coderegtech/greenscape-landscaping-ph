import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EmployeeForm, type EmployeeData } from '@/components/employee-form';
import { employeeOptions } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Employee' };
export const dynamic = 'force-dynamic';

const Employee = z.object({
  id: z.string(), employeeNo: z.string(), firstName: z.string(), lastName: z.string(), email: z.string().nullable(), mobile: z.string().nullable(), position: z.string().nullable(),
  departmentId: z.string().nullable(), managerId: z.string().nullable(), employmentStatus: z.string(), hiredOn: z.string().nullable(), account: z.string().nullable(),
  schedules: z.array(z.object({ id: z.string(), name: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable() })),
});

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaff();
  if (!me || !can(me, 'employees.read')) redirect('/');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e, o] = await Promise.all([
    api(`/v1/hr/employees/${id}`, Employee).catch((err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    }),
    employeeOptions(),
  ]);
  const initial: EmployeeData = { ...e, email: e.email ?? '', mobile: e.mobile ?? '', position: e.position ?? '', departmentId: e.departmentId ?? '', managerId: e.managerId ?? '', hiredOn: e.hiredOn ?? '' };
  return (
    <div className="flex flex-col gap-6">
      <Link href="/employees" className="self-start text-sm text-ink-2">Employees</Link>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <h2 className="text-3xl">{e.firstName} {e.lastName}</h2>
        {can(me, 'attendance.read') && <Link href={`/attendance/employee/${e.id}`} className="text-sm">Attendance history</Link>}
      </div>
      <EmployeeForm initial={initial} {...o} canManage={can(me, 'employees.manage')} />
    </div>
  );
}
