import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EmployeeForm } from '@/components/employee-form';
import { employeeOptions } from '@/lib/hr';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'New employee' };
export const dynamic = 'force-dynamic';

export default async function NewEmployee() {
  const me = await getStaff();
  if (!me || !can(me, 'employees.manage')) redirect('/employees');
  const o = await employeeOptions();
  return (
    <div className="flex flex-col gap-6">
      <Link href="/employees" className="self-start text-sm text-ink-2">Employees</Link>
      <h2 className="text-3xl">New employee</h2>
      <EmployeeForm canManage {...o} initial={{ id: null, employeeNo: '', firstName: '', lastName: '', email: '', mobile: '', position: '', departmentId: '', managerId: '', employmentStatus: 'ACTIVE', hiredOn: '', account: null, schedules: [] }} />
    </div>
  );
}
