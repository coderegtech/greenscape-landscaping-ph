'use server';
import { api, attempt } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import { revalidatePath } from 'next/cache';

export type SendState = { ok: true; at: string } | { ok: false; error: string } | null;

/** Form action, so a message sent before the page's JavaScript loads still goes through. */
export async function sendMessage(_prev: SendState, form: FormData): Promise<SendState> {
  const body = String(form.get('body') ?? '').trim();
  if (!body) return { ok: false, error: 'Write a message first.' };
  const res = await attempt(() => api('/v1/me/messages', z.any(), { method: 'POST', body: JSON.stringify({ body }) }));
  revalidatePath('/messages');
  return res.ok ? { ok: true, at: new Date().toISOString() } : { ok: false, error: res.error };
}
