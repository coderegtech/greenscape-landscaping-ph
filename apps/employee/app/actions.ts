'use server';
// Employee portal actions. The API decides everything (who is an employee, the time of a punch, balances).
import { api, attempt } from '@greenscape/auth/api';
import { CorrectionRequest, EmployeeUploadRequest, LeaveRequestInput, z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';

const Any = z.any();
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const done = <T,>(r: T) => { revalidatePath('/', 'layout'); return r; }; // every portal page shows attendance or requests

export type ClockState = { ok: true; type: 'IN' | 'OUT'; at: string } | { ok: false; error: string } | null;
/** Form action (works before the page's JavaScript loads, so an early tap on a slow phone still counts). */
export async function clockForm(_prev: ClockState, form: FormData): Promise<ClockState> {
  const type = z.enum(['IN', 'OUT']).parse(form.get('type'));
  const photoId = z.string().uuid().optional().parse(form.get('photoId') || undefined);
  const res = await attempt(() => api('/v1/me/attendance/punch', Any, json('POST', { type, photoId })).then(done));
  return res.ok ? { ok: true, type, at: new Date().toISOString() } : { ok: false, error: res.error };
}
/** One-time signed upload link for a correction attachment or a clock-in selfie (reserved for this person only). */
export async function correctionAttachmentSlot(input: unknown) {
  return attempt(() => api('/v1/me/attendance/attachments', z.object({ id: z.string().uuid(), uploadUrl: z.string().url() }), json('POST', EmployeeUploadRequest.parse(input))));
}
export async function requestCorrection(input: unknown) {
  return attempt(() => api('/v1/me/attendance/corrections', Any, json('POST', CorrectionRequest.parse(input))).then(done));
}
export async function requestLeave(input: unknown) {
  return attempt(() => api('/v1/me/leave', Any, json('POST', LeaveRequestInput.parse(input))).then(done));
}
export async function cancelLeave(id: string) {
  return attempt(() => api(`/v1/me/leave/${z.string().uuid().parse(id)}/cancel`, Any, json('POST', {})).then(done));
}
