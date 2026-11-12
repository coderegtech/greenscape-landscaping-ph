import 'server-only';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getAccessToken } from './next.ts';
import type { z } from 'zod';

/**
 * The visitor's address for the API's rate limits, vouched for by INTERNAL_API_KEY (server-only). Taken from
 * X-Forwarded-For counting TRUSTED_PROXY_HOPS from the right (default 1: the address our nearest proxy saw), so a
 * value the browser puts in the header itself is never the one used. Empty outside a request or without the key.
 */
export async function clientHeaders(): Promise<Record<string, string>> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return {};
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return {}; // build time / no request
  }
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const chain = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const ip = (chain[chain.length - hops] ?? h.get('x-real-ip') ?? '').replace(/^::ffff:/, '');
  return isIP(ip) ? { 'x-client-ip': ip, 'x-internal-key': key } : { 'x-internal-key': key };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Server-side call to the Express API, forwarding the user's access token when signed in. */
export async function api<T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}): Promise<z.infer<T>> {
  const [token, client] = await Promise.all([getAccessToken(), clientHeaders()]);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...client, ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
  if (res.status === 204) return schema.parse(undefined);
  const body = await res.json().catch(() => ({}));
  // Signed out everywhere by an administrator: the refused request already ended the session at Supabase, so the
  // login page (every app has /login; the website forwards it to /auth/login) starts clean.
  if (res.status === 401 && body?.error?.code === 'SESSION_REVOKED') redirect('/login');
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? res.statusText, body?.error?.details);
  return schema.parse(body);
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; details?: unknown };

/** For server actions: never throw across the action boundary (messages are lost in production builds). */
export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err); // let redirect()/notFound() from inside the action through
    if (err instanceof ApiError) return { ok: false, status: err.status, error: err.message, details: err.details };
    console.error('server action failed', err); // unexpected: keep the cause in the server log, not the browser
    return { ok: false, status: 500, error: 'Something went wrong. Please try again.' };
  }
}
