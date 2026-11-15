import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { cleanupEmployees, employeeUser, userWithRoles } from './fixtures/test-users';
import { ADMIN, EMPLOYEE, signIn } from './helpers';

// Real push messages delivered to each portal's own service worker through Chromium's DevTools protocol (the path
// DevTools' "Push" button uses; no push service involved), then what the worker displayed is read back. The system
// notification itself, its sound and a tap on it need a real device: docs/notifications/testing.md.
const APPS = [{ key: 'admin', url: ADMIN }, { key: 'employee', url: EMPLOYEE }] as const;

test.skip(({ browserName }) => browserName !== 'chromium', 'push delivery through DevTools is Chromium-only');
// The default headless shell has no notifications (permission stays "denied"); full Chromium in headless mode has them.
// Without `playwright install chromium` locally, E2E_PUSH_CHANNEL=msedge uses the Edge that ships with Windows.
test.use({ channel: process.env.E2E_PUSH_CHANNEL || 'chromium' });

type Shown = { title: string; body: string; icon: string; badge: string; tag: string; url?: string };
const shown = (page: Page) => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, icon: n.icon, badge: n.badge, tag: n.tag, url: n.data?.url })));

async function registrationOf(cdp: CDPSession, origin: string) {
  const regs: { registrationId: string; scopeURL: string; isDeleted: boolean }[] = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => regs.some((r) => r.scopeURL === `${origin}/` && !r.isDeleted)).toBe(true);
  return regs.find((r) => r.scopeURL === `${origin}/` && !r.isDeleted)!.registrationId;
}

for (const app of APPS) {
  test(`${app.key}: its service worker shows pushes with its own icon, even when no window is open`, async ({ page, context }) => {
    const origin = new URL(app.url).origin;
    await context.grantPermissions(['notifications'], { origin });
    await page.goto(`${app.url}/login`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await context.newCDPSession(page);
    const registrationId = await registrationOf(cdp, origin);
    const push = (data: object | string) => cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: typeof data === 'string' ? data : JSON.stringify(data) });

    // No window of this portal open (the app is closed): the worker alone displays it.
    await page.goto('about:blank');
    await push({ id: 'n1', title: 'Leave request from Ana', body: 'Vacation, 2026-12-01.', url: '/leave', tag: 'n1', type: 'leave.requested', priority: 'HIGH' });
    await push('not json'); // a garbled payload still shows something, never crashes the worker
    await page.goto(`${app.url}/login`);
    await expect.poll(() => shown(page).then((l) => l.length)).toBeGreaterThanOrEqual(2);
    const list: Shown[] = await shown(page);
    expect(list.find((n) => n.tag === 'n1')).toEqual({ title: 'Leave request from Ana', body: 'Vacation, 2026-12-01.', icon: `${origin}/icons/${app.key}-192.png`, badge: `${origin}/icons/badge-96.png`, tag: 'n1', url: '/leave' });
    expect(list.find((n) => n.body === 'not json')).toMatchObject({ title: 'Greenscape', url: '/' });

    // The same id again replaces instead of stacking.
    await page.goto('about:blank');
    await push({ id: 'n1', title: 'Leave request from Ana (edited)', body: 'x', url: '/leave', tag: 'n1' });
    await page.goto(`${app.url}/login`);
    await expect.poll(async () => (await shown(page)).filter((n) => n.tag === 'n1').map((n) => n.title)).toEqual(['Leave request from Ana (edited)']);

    // A focused tab already shows it in the app (toast and sound): no system copy. The test alert is sent from a
    // focused tab on purpose, so it shows anyway.
    await page.bringToFront();
    await push({ id: 'f1', title: 'Seen in the app', body: 'x', url: '/', tag: 'f1', type: 'order.paid.staff' });
    await push({ id: 't1', title: 'Test alert', body: 'Alerts work on this device.', url: '/notifications', tag: 't1', type: 'push.test' });
    await expect.poll(async () => (await shown(page)).some((n) => n.tag === 't1'), { timeout: 30_000 }).toBe(true);
    expect((await shown(page)).some((n) => n.tag === 'f1')).toBe(false); // pushes are handled in order: f1 was settled before t1 showed
    await cdp.detach();
  });
}

const tag = `push${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

async function settings(page: Page, base: string, email: string) {
  await page.goto(`${base}/login?next=/notifications`);
  await signIn(page, email);
  await page.waitForURL(`${base}/notifications`);
  await page.getByRole('tab', { name: 'Settings' }).click();
}

test('each portal lists only its own kinds of notification', async ({ page, browser }) => {
  test.skip(!process.env.VAPID_PUBLIC_KEY, 'Web Push is not configured in this environment (pnpm vapid:keys)');
  const admin = await userWithRoles(`${tag}-adm`, ['admin']);
  await settings(page, ADMIN, admin.email);
  await expect(page.getByRole('checkbox', { name: 'Alerts: Employee clock-ins' })).toBeVisible({ timeout: 30_000 }); // first API call of a fresh account
  await expect(page.getByRole('checkbox', { name: 'Alerts: Low stock' })).toBeVisible();

  const emp = await employeeUser(`${tag}-emp`);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await settings(p2, EMPLOYEE, emp.email);
  await expect(p2.getByRole('checkbox', { name: 'Alerts: Attendance and leave' })).toBeVisible();
  for (const hidden of ['Employee clock-ins', 'Low stock', 'Orders and payments', 'Quote requests']) await expect(p2.getByRole('checkbox', { name: `Alerts: ${hidden}` })).toHaveCount(0);
  await ctx.close();
});
