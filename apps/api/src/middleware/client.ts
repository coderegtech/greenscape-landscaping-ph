import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * The visitor's network address. The website and admin call the API from their own servers (server actions), so for
 * those requests the socket address is the Next server. They forward the visitor's address in `x-client-ip`, which is
 * believed only together with `x-internal-key` = INTERNAL_API_KEY (server-only secret); anyone else gets `req.ip`.
 */
export function clientAddress(req: Request, internalKey: string | undefined) {
  const given = req.get('x-internal-key');
  if (internalKey && given && safeEqual(given, internalKey)) {
    const ip = req.get('x-client-ip')?.trim();
    if (ip && isIP(ip)) return ip;
  }
  return req.ip ?? 'unknown';
}

/** True when the request comes from one of our Next servers (holds the internal key). */
export const isInternal = (req: Request, internalKey: string | undefined) => {
  const given = req.get('x-internal-key');
  return !!internalKey && !!given && safeEqual(given, internalKey);
};

/** Rate-limit / log key: keyed hash, so Redis and logs never hold a raw address or user id. IPv6 grouped by /56. */
export function clientKey(req: Request, internalKey: string | undefined, userId?: string) {
  const id = userId ? `u:${userId}` : `ip:${ipKeyGenerator(clientAddress(req, internalKey))}`;
  return (internalKey ? createHmac('sha256', internalKey) : createHash('sha256')).update(id).digest('base64url').slice(0, 27);
}
