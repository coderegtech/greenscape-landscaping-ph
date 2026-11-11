import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { manilaDate } from '../../apps/api/src/modules/attendance/time.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// Cookieless analytics: only the website server may report views; counters are per day; no visitor data is stored.
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const tag = `an${Date.now()}`;
const KEY = 'test-internal-key-for-analytics-0123456789abcdef';
let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const tokens = { admin: '', content: '', customer: '' };
const day = new Date(`${manilaDate(new Date())}T00:00:00Z`);
const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile ${tag}`;
const view = (body: object, ip = '203.0.113.7') => request(app).post('/v1/analytics/pageview').set({ 'x-internal-key': KEY, 'x-client-ip': ip }).send(body);
const count = async (metric: string, key = '') => (await deps.db.analyticsDaily.findUnique({ where: { day_metric_key: { day, metric, key } } }))?.count ?? 0;

async function withRoles(label: string, roles: string[]) {
  const u = await signedInUser(`${label}-${tag}`);
  authIds.push(u.authUserId);
  await request(app).get('/v1/auth/me').set(as(u.token)).expect(200);
  const user = await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } });
  const rows = await deps.db.role.findMany({ where: { key: { in: roles } } });
  await deps.db.userRole.createMany({ data: rows.map((r) => ({ userId: user.id, roleId: r.id })), skipDuplicates: true });
  await deps.cache.invalidateTags([`authz:user:${user.id}`]);
  return u.token;
}

beforeAll(async () => {
  deps = await testDeps({ CACHE_PREFIX: `gs:test:${tag}`, INTERNAL_API_KEY: KEY });
  app = createApp(deps);
  [tokens.admin, tokens.content, tokens.customer] = await Promise.all([withRoles('anadmin', ['admin']), withRoles('ancms', ['content_manager']), withRoles('ancust', [])]);
}, 60_000);

afterAll(async () => {
  await deps.db.analyticsDaily.deleteMany({ where: { key: { contains: tag } } });
  const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('collection', () => {
  it('is refused from anything but the website server', async () => {
    await request(app).post('/v1/analytics/pageview').send({ path: `/x-${tag}`, ua }).expect(403);
    await request(app).post('/v1/analytics/pageview').set({ 'x-internal-key': 'wrong-key-wrong-key-wrong-key-wrong' }).send({ path: `/x-${tag}`, ua }).expect(403);
  });

  it('counts page views per path, and a visitor once per day', async () => {
    const path = `/p-${tag}`;
    const visitors = await count('visitor');
    const google = await count('source', 'google.com');
    await view({ path: `${path}?utm_source=x`, referrer: 'https://www.google.com/', ua }).expect(204);
    await view({ path, ua }).expect(204);
    await view({ path, ua }).expect(204);
    expect(await count('pageview', path)).toBe(3);
    expect(await count('visitor')).toBe(visitors + 1); // same address + browser today: one visitor
    expect(await count('source', 'google.com')).toBe(google + 1); // source is taken from the first view only
    await view({ path, ua }, '203.0.113.8').expect(204);
    expect(await count('visitor')).toBe(visitors + 2);
  });

  it('ignores bots, junk paths and missing browsers', async () => {
    await view({ path: `/b-${tag}`, ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' }).expect(204);
    await view({ path: `/b-${tag}` }).expect(204);
    await view({ path: `/api/b-${tag}`, ua }).expect(204);
    await view({ path: 42, ua }).expect(204);
    expect(await count('pageview', `/b-${tag}`)).toBe(0);
    expect(await count('pageview', `/api/b-${tag}`)).toBe(0);
  });
});

describe('report', () => {
  it('needs analytics.read', async () => {
    await request(app).get('/v1/admin/analytics').expect(401);
    await request(app).get('/v1/admin/analytics').set(as(tokens.customer)).expect(403);
  });

  it('returns the period, the previous period and breakdowns; revenue only with reports.sales', async () => {
    const res = await request(app).get('/v1/admin/analytics?days=7').set(as(tokens.admin)).expect(200);
    expect(res.body.days).toBe(7);
    expect(res.body.daily).toHaveLength(7);
    expect(res.body.pages.length).toBeGreaterThan(0);
    expect(res.body.totals.pageviews).toBeGreaterThanOrEqual(4);
    expect(res.body.totals).toHaveProperty('revenue');
    expect(res.body.previous).toHaveProperty('visitors');
    const cms = await request(app).get('/v1/admin/analytics?days=999').set(as(tokens.content)).expect(200);
    expect(cms.body.days).toBe(30); // anything else falls back to 30
    expect(cms.body.totals).not.toHaveProperty('revenue');
  });
});
