import { describe, expect, it } from 'vitest';
import { securityEvent } from '../../apps/api/src/lib/security-log.ts';
import { errorHandler } from '../../apps/api/src/middleware/error-handler.ts';

// Security audit M-4 (event shape) and L-2 (no database metadata in conflict errors).
const req = (over: Record<string, unknown> = {}) =>
  ({ method: 'POST', originalUrl: '/v1/users/abc/roles?token=secret-in-query', url: '/x', ip: '203.0.113.9', get: (h: string) => ({ authorization: 'Bearer eyJhbGciOi.secret', 'user-agent': 'x' })[h.toLowerCase()], ...over }) as never;
const res = (locals: Record<string, unknown> = {}) => {
  const r = { statusCode: 403, locals, body: undefined as unknown, status(c: number) { r.statusCode = c; return r; }, json(b: unknown) { r.body = b; return r; } };
  return r;
};

describe('security events', () => {
  it('carry ids and a hashed client, never tokens, query strings or raw addresses', () => {
    const e = securityEvent(req(), res({ requestId: 'req-1', auth: { userId: 'u-1', email: 'owner@example.com' } }) as never, 'security.forbidden', 'k'.repeat(32));
    expect(e).toMatchObject({ channel: 'security', event: 'security.forbidden', requestId: 'req-1', method: 'POST', path: '/v1/users/abc/roles', status: 403, userId: 'u-1' });
    const text = JSON.stringify(e);
    for (const leak of ['secret', 'eyJ', '203.0.113.9', 'owner@example.com', 'token=']) expect(text).not.toContain(leak);
    expect(e.client).toMatch(/^[\w-]{20,}$/);
  });

  it('hash the same client the same way (correlatable) and different clients differently', () => {
    const a = securityEvent(req(), res() as never, 'x', 'k'.repeat(32)).client;
    expect(securityEvent(req(), res() as never, 'x', 'k'.repeat(32)).client).toBe(a);
    expect(securityEvent(req({ ip: '203.0.113.10' }), res() as never, 'x', 'k'.repeat(32)).client).not.toBe(a);
  });
});

describe('error responses', () => {
  it('a unique-constraint conflict does not reveal table, column or constraint names (L-2)', () => {
    const r = res({ requestId: 'req-2' });
    errorHandler({ code: 'P2002', meta: { modelName: 'User', target: ['email'] } }, req(), r as never, () => undefined);
    expect(r.statusCode).toBe(409);
    expect(JSON.stringify(r.body)).not.toMatch(/email|User|target/);
  });
});
