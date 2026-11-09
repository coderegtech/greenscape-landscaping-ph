import 'server-only';
import { getAccessToken } from './next.ts';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Server-side call to the Express API, forwarding the user's access token when signed in. */
export async function api<T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}): Promise<z.infer<T>> {
  const token = await getAccessToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
  if (res.status === 204) return schema.parse(undefined);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? res.statusText, body?.error?.details);
  return schema.parse(body);
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; details?: unknown };

/** For server actions: never throw across the action boundary (messages are lost in production builds). */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message, details: err.details };
    console.error('server action failed', err); // unexpected: keep the cause in the server log, not the browser
    return { ok: false, status: 500, error: 'Something went wrong. Please try again.' };
  }
}
