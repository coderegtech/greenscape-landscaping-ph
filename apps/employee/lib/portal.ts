import 'server-only';
import { ApiError, api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import { cache } from 'react';
import type { Today } from '@/components/clock-card';
import type { MyLeave } from '@/components/leave';
import { getMe } from './session';

// Everything the portal shows comes from the API as the signed-in employee; these loaders are cached per request so
// the layout and the page share one call.
export const DayRecord = z.object({
  id: z.string(), workDate: z.string(), status: z.string(), statusLabel: z.string(), approved: z.boolean(), workedMinutes: z.number(), lateMinutes: z.number(),
  undertimeMinutes: z.number(), overtimeMinutes: z.number(), punches: z.array(z.object({ type: z.string(), at: z.string(), corrected: z.boolean() })), correctionPending: z.boolean(),
});
export type DayRecord = z.infer<typeof DayRecord>;

export const ScheduleDay = z.object({
  date: z.string(),
  schedule: z.object({ name: z.string(), flexible: z.boolean() }).nullable(),
  segments: z.array(z.object({ start: z.string(), end: z.string(), breakMinutes: z.number() })),
  holiday: z.object({ name: z.string(), working: z.boolean() }).nullable(),
  onLeave: z.boolean(),
});
export type ScheduleDay = z.infer<typeof ScheduleDay>;

export const getToday = cache(() => api('/v1/me/attendance/today', z.custom<Today>()));
export const getLeave = cache(() => api('/v1/me/leave', z.custom<MyLeave>()));
export const getSchedule = cache(async () => (await api('/v1/me/schedule', z.object({ days: z.array(ScheduleDay) }))).days);
/** Own days, newest first: the last 30 by default, or a from/to range. */
export const getDays = cache((from?: string, to?: string) => api(`/v1/me/attendance${from && to ? `?${new URLSearchParams({ from, to })}` : ''}`, z.array(DayRecord)));

/** Who may use the portal is decided by the API. Returns the person and their day, or the reason they are turned away. */
export const portal = cache(async (): Promise<{ ok: true; email: string; today: Today } | { ok: false; message: string }> => {
  const me = await getMe();
  if (!me) return { ok: false, message: 'This account is suspended.' };
  if (me.passwordSignInRequired) return { ok: false, message: 'You signed in with Google. The employee portal needs your work email and password: sign out, then sign in again.' };
  if (!me.permissions.includes('attendance.self')) return { ok: false, message: 'This portal is for Greenscape employees. Customers can use the website.' };
  try {
    return { ok: true, email: me.user.email, today: await getToday() };
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return { ok: false, message: err.code === 'NOT_AN_EMPLOYEE' ? err.message : 'This portal is for Greenscape employees.' };
    throw err;
  }
});
