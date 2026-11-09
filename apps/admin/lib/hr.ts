import 'server-only';
import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';

const Opt = z.object({ id: z.string(), name: z.string() });

/** Choices for the employee form: departments, possible managers, schedules. */
export async function employeeOptions() {
  const [departments, people, schedules] = await Promise.all([
    api('/v1/hr/departments', z.array(Opt)),
    api('/v1/hr/employees', z.array(Opt)),
    api('/v1/hr/schedules', z.array(Opt)),
  ]);
  return { departments, managers: people, schedules };
}

export const manilaToday = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
export const shiftDay = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const longDay = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
