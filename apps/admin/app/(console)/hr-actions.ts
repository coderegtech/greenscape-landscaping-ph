'use server';
// HR server actions. Each calls the API with the staff member's own token; the API checks employees.*, attendance.*,
// leave.* and reports.attendance, blocks self-approval, and writes the audit log.
import { api, attempt } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Any = z.any();
const Id = z.string().uuid();
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

/** New employees continue in their own page, navigated from the server (a client push can lose to revalidation). */
export async function saveEmployee(id: string | null, input: unknown) {
  const res = await attempt(async () => {
    const out = await api(id ? `/v1/hr/employees/${Id.parse(id)}` : '/v1/hr/employees', Any, json(id ? 'PUT' : 'POST', input));
    revalidatePath('/employees');
    return out as { id: string };
  });
  if (res.ok && !id) redirect(`/employees/${res.data.id}`);
  return res;
}
export async function linkAccount(id: string) {
  return attempt(() => api(`/v1/hr/employees/${Id.parse(id)}/link`, Any, json('POST', {})));
}
export async function assignSchedule(employeeId: string, scheduleId: string, effectiveFrom: string) {
  return attempt(() => api(`/v1/hr/employees/${Id.parse(employeeId)}/schedule`, Any, json('POST', { scheduleId, effectiveFrom })));
}
export async function addDepartment(name: string) {
  return attempt(() => api('/v1/hr/departments', Any, json('POST', { name })));
}
export async function saveSchedule(id: string | null, input: unknown) {
  return attempt(async () => {
    const out = await api(id ? `/v1/hr/schedules/${Id.parse(id)}` : '/v1/hr/schedules', Any, json(id ? 'PUT' : 'POST', input));
    revalidatePath('/employees/schedules');
    return out;
  });
}
export async function approveDays(recordIds: string[]) {
  return attempt(async () => {
    const out = await api('/v1/hr/attendance/approve', Any, json('POST', { recordIds }));
    revalidatePath('/attendance');
    return out as { approved: number; skipped: number };
  });
}
export async function editDay(recordId: string, punches: unknown, reason: string) {
  return attempt(async () => {
    const out = await api(`/v1/hr/attendance/records/${Id.parse(recordId)}`, Any, json('PUT', { punches, reason }));
    revalidatePath('/attendance');
    return out;
  });
}
export async function decideCorrection(id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
  return attempt(async () => {
    const out = await api(`/v1/hr/corrections/${Id.parse(id)}/decision`, Any, json('POST', { decision, note }));
    revalidatePath('/attendance/corrections');
    return out;
  });
}
export async function decideLeave(id: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
  return attempt(async () => {
    const out = await api(`/v1/hr/leave/${Id.parse(id)}/decision`, Any, json('POST', { decision, note }));
    revalidatePath('/leave');
    return out;
  });
}
export async function cancelLeave(id: string) {
  return attempt(async () => {
    const out = await api(`/v1/hr/leave/${Id.parse(id)}/cancel`, Any, json('POST', {}));
    revalidatePath('/leave');
    return out;
  });
}
export async function setBalance(input: unknown) {
  return attempt(() => api('/v1/hr/leave/balances', Any, json('PUT', input)));
}
export async function saveLeaveType(id: string | null, input: unknown) {
  return attempt(async () => {
    const out = await api(id ? `/v1/hr/leave-types/${Id.parse(id)}` : '/v1/hr/leave-types', Any, json(id ? 'PUT' : 'POST', input));
    revalidatePath('/leave/settings');
    return out;
  });
}
export async function addHoliday(input: unknown) {
  return attempt(async () => {
    const out = await api('/v1/hr/holidays', Any, json('POST', input));
    revalidatePath('/leave/settings');
    return out;
  });
}
export async function deleteHoliday(id: string) {
  return attempt(async () => {
    await api(`/v1/hr/holidays/${Id.parse(id)}`, z.undefined(), json('DELETE', {}));
    revalidatePath('/leave/settings');
    return true;
  });
}
