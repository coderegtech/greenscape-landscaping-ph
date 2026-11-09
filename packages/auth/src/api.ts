import 'server-only';
import { getAccessToken } from './next.ts';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Server-side call to the Express API, forwarding the user's access token when signed in. */
export async function api<T extends z.ZodType>(path: string, schema: T, init: RequestInit = {}): Promise<z.infer<T>> {
  const token = await getAccessToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(5000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? res.statusText);
  return schema.parse(body);
}
