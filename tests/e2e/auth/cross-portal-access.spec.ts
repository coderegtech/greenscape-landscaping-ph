import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { ADMIN, EMPLOYEE, WEB, email, signIn } from '../helpers';
import { call, cleanupEmployees, employeeUser, userWithRoles, type TestUser } from '../fixtures/test-users';

// Every role against every portal, enforced by the API (not just by page redirects): 401 when not signed in or the token
// is bad, 403 when signed in without permission. Plus records that belong to someone else.
test.skip(({ isMobile }) => isMobile, 'API and role matrix: one pass is enough');
// Parallel workers each run afterAll: a shared label would let one worker delete employees another still uses.
const tag = `xportal${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

type Who = 'guest' | 'customer' | 'employee' | 'admin' | 'super';
const users = {} as Record<Exclude<Who, 'guest'>, TestUser>;
test.beforeAll(async () => {
  const [c, e, a, s] = await Promise.all([userWithRoles('xcust', []), employeeUser(`${tag}`), userWithRoles('xadmin', ['admin']), userWithRoles('xsuper', ['super_admin'])]);
  Object.assign(users, { customer: c, employee: e, admin: a, super: s });
});
const tokenOf = (w: Who) => (w === 'guest' ? undefined : users[w].token);

// [method, path, body, expected for guest, customer, employee, admin, super]
const MATRIX: [string, string, unknown, number, number, number, number, number][] = [
  ['GET', '/v1/auth/me', undefined, 401, 200, 200, 200, 200],
  ['GET', '/v1/me/attendance/today', undefined, 401, 403, 200, 403, 403], // staff without an HR record are not employees
  ['GET', '/v1/orders/mine', undefined, 401, 200, 200, 200, 200], // always only the caller's own
  ['GET', '/v1/hr/employees', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/hr/settings/selfie', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/users', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/cms-admin/pages', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/admin/overview', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/admin/analytics', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/admin/system', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/admin/audit', undefined, 401, 403, 403, 200, 200],
  ['GET', '/v1/shop-admin/inventory', undefined, 401, 403, 403, 200, 200],
];
// Writes only checked for people who must be refused (nothing is changed when the check is right).
const REFUSED_WRITES: [string, string, unknown][] = [
  ['POST', '/v1/users', { email: 'x@e2e.greenscape.local', displayName: 'X', roles: ['employee'] }],
  ['POST', '/v1/hr/employees', { employeeNo: 'E2E-NOPE', firstName: 'No', lastName: 'Pe', employmentStatus: 'ACTIVE' }],
  ['PUT', '/v1/hr/settings/selfie', { mode: 'off', retentionDays: 90 }],
  ['PUT', '/v1/cms-admin/site/config', {}],
  ['PUT', `/v1/shop-admin/products/${randomUUID()}`, { name: 'Free plants' }],
  ['POST', `/v1/hr/corrections/${randomUUID()}/decision`, { decision: 'APPROVED' }],
];

test('API permission matrix: 401 without a session, 403 without the permission, 200 with it', async () => {
  const rows: string[] = [];
  for (const [method, path, body, ...expected] of MATRIX) {
    const got = await Promise.all((['guest', 'customer', 'employee', 'admin', 'super'] as Who[]).map(async (w) => (await call(path, tokenOf(w), { method, body: body ? JSON.stringify(body) : undefined })).status));
    rows.push(`${method} ${path}: ${got.join(' ')}`);
    expect(got, `${method} ${path} (guest customer employee admin super)`).toEqual(expected);
  }
  for (const [method, path, body] of REFUSED_WRITES) {
    for (const w of ['guest', 'customer', 'employee'] as Who[]) {
      const status = (await call(path, tokenOf(w), { method, body: JSON.stringify(body) })).status;
      expect(status, `${w} ${method} ${path}`).toBe(w === 'guest' ? 401 : 403);
    }
  }
  test.info().annotations.push({ type: 'matrix', description: rows.join('\n') });
});

test('bad tokens are 401: garbage, wrong scheme, forged signature, unsigned', async () => {
  const forged = await new SignJWT({ email: 'x@e2e.greenscape.local', role: 'authenticated', aal: 'aal2', amr: [{ method: 'password', timestamp: 1 }] })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(randomUUID()).setIssuer(`${process.env.SUPABASE_URL}/auth/v1`).setAudience('authenticated').setExpirationTime('1h')
    .sign(new TextEncoder().encode('not-the-project-key-not-the-project-key'));
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: randomUUID(), email: 'x@x.x', aud: 'authenticated' })).toString('base64url')}.`;
  for (const auth of ['Bearer garbage', `Basic ${users.admin.token}`, `Bearer ${forged}`, `Bearer ${unsigned}`, 'Bearer']) {
    const res = await call('/v1/users', undefined, { headers: { authorization: auth } });
    expect(res.status, auth.slice(0, 12)).toBe(401);
    const text = await res.text();
    expect(text).not.toMatch(/stack|at .*\.ts|prisma/i);
  }
});

test('nobody reads another customer\'s quotation or order', async () => {
  const a = await userWithRoles('owner', []);
  const q = await call('/v1/quotations', a.token, {
    method: 'POST',
    body: JSON.stringify({ services: ['garden-design'], propertyType: 'residential', projectLocation: 'Puerto Princesa', details: 'Front garden for an auth test.', name: 'Owner Person', email: email('owner-contact'), phone: '09178443330', consent: true, attachments: [] }),
  });
  expect(q.status).toBe(201);
  const db = createPrismaClient(process.env.DATABASE_URL!);
  try {
    const quote = await db.quotation.findUniqueOrThrow({ where: { number: (await q.json()).number }, select: { id: true, number: true } });
    for (const w of ['customer', 'employee'] as const) {
      expect((await call(`/v1/quotations/${quote.id}`, users[w].token)).status, `${w} reads quote detail`).toBe(403);
      expect(JSON.stringify(await (await call('/v1/quotations/mine', users[w].token)).json())).not.toContain(quote.number);
    }
    expect((await call(`/v1/quotations/${quote.id}`, users.admin.token)).status).toBe(200); // staff with quotations.read can
    const order = await db.order.findFirst({ select: { number: true } });
    if (order) for (const w of ['customer', 'employee'] as const) expect([403, 404], `${w} reads order`).toContain((await call(`/v1/orders/${order.number}`, users[w].token)).status);
    expect([403, 404]).toContain((await call('/v1/orders/GS-2026-999999', users.customer.token)).status);
  } finally {
    await db.$disconnect();
  }
});

test('in the browser, each role is turned away from the portals that are not theirs', async ({ browser }) => {
  for (const [who, home] of [['customer', `${WEB}/auth/login`], ['employee', `${EMPLOYEE}/login`], ['admin', `${ADMIN}/login`]] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(home);
    await signIn(page, users[who].email);
    await page.waitForURL((u) => !/\/(auth\/)?login/.test(u.pathname)); // signed in before trying the other portals
    if (who !== 'employee') {
      await page.goto(`${EMPLOYEE}/`);
      await expect(page.getByRole('button', { name: 'Clock in' }), `${who} in employee portal`).toHaveCount(0);
      await expect(page.getByText(/This portal is for Greenscape employees|not linked to an employee record/).first()).toBeVisible();
    }
    if (who !== 'admin') {
      await page.goto(`${ADMIN}/`);
      await expect(page.getByTestId('staff-identity'), `${who} in admin`).toHaveCount(0);
    }
    await ctx.close();
  }
});
