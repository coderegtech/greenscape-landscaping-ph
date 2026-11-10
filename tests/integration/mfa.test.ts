import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, mfaSignedInUser, signedInUser } from './supabase.ts';

// H-2 (docs/security/security-audit.md): with REQUIRE_STAFF_MFA (the default outside tests), staff permissions
// exist only in multi-factor (aal2) sessions. Password-only sessions keep self-service access.
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('staff MFA', () => {
  let deps: Deps;
  let app: ReturnType<typeof createApp>;
  let staff: Awaited<ReturnType<typeof mfaSignedInUser>>;
  let customer: Awaited<ReturnType<typeof signedInUser>>;
  const authIds: string[] = [];

  beforeAll(async () => {
    deps = await testDeps({ REQUIRE_STAFF_MFA: 'true' });
    app = createApp(deps);
    staff = await mfaSignedInUser('mfa-staff');
    customer = await signedInUser('mfa-customer');
    authIds.push(staff.authUserId, customer.authUserId);
    await request(app).get('/v1/auth/me').set(as(staff.token)).expect(200); // creates the user row
    const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: staff.authUserId } });
    const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'content_manager' } });
    await deps.db.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  });

  afterAll(async () => {
    const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
    await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
    await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await deleteAuthUsers(authIds);
    await closeDeps(deps);
  });

  it('withholds staff permissions from a password-only session and says why', async () => {
    const me = await request(app).get('/v1/auth/me').set(as(staff.aal1Token)).expect(200);
    expect(me.body).toMatchObject({ mfaRequired: true, aal: 'aal1' });
    expect(me.body.roles).toContain('content_manager');
    expect(me.body.permissions).not.toContain('admin.access');
    expect(me.body.permissions).not.toContain('media.read');
    const res = await request(app).get('/v1/media').set(as(staff.aal1Token)).expect(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('still allows self-service with a password-only session', async () => {
    await request(app).get('/v1/quotations/mine').set(as(staff.aal1Token)).expect(200);
  });

  it('grants staff permissions to the multi-factor session', async () => {
    const me = await request(app).get('/v1/auth/me').set(as(staff.token)).expect(200);
    expect(me.body).toMatchObject({ mfaRequired: false, aal: 'aal2' });
    expect(me.body.permissions).toEqual(expect.arrayContaining(['admin.access', 'media.read', 'cms.read']));
    await request(app).get('/v1/media').set(as(staff.token)).expect(200);
  });

  it('does not ask customers for MFA', async () => {
    const me = await request(app).get('/v1/auth/me').set(as(customer.token)).expect(200);
    expect(me.body.mfaRequired).toBe(false);
    await request(app).get('/v1/quotations/mine').set(as(customer.token)).expect(200);
  });

  it('a customer is still refused staff routes as FORBIDDEN, not MFA_REQUIRED', async () => {
    const res = await request(app).get('/v1/media').set(as(customer.token)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
