import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { cleanupEmployees, employeeUser, userWithRoles } from './fixtures/test-users';
import { ADMIN, EMPLOYEE, hydrated, signIn } from './helpers';

// The two installable apps: each origin has its own manifest, icons, service worker and cache; the worker keeps only
// the offline screen and icons; nothing private is cached; attendance needs the server. Operating-system installation
// itself cannot be driven from Playwright: see docs/pwa/testing.md for the device checklist.
const APPS = [
  { key: 'admin', url: ADMIN, name: 'Greenscape Admin', short: 'GS Admin', theme: '#193C2B', background: '#F5F8F5' },
  { key: 'employee', url: EMPLOYEE, name: 'Greenscape Employee', short: 'GS Employee', theme: '#368A5B', background: '#F7FAF7' },
] as const;
const shell = (key: string) => [`/icons/${key}-192.png`, `/icons/${key}-512.png`, '/offline']; // sorted, as cached() returns them

// Each worker cleans up only the employees it made (tests here run in parallel workers).
const tag = `pwa${randomUUID().slice(0, 6)}`;
test.afterAll(() => cleanupEmployees(tag));

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;

/** Every cached address on this origin, by cache name. */
const cached = (page: Page) => page.evaluate(async () => {
  const out: Record<string, string[]> = {};
  for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname).sort();
  return out;
});
const workerReady = (page: Page) => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return { scope: reg.scope, script: reg.active!.scriptURL };
});

for (const app of APPS) {
  const other = APPS.find((a) => a.key !== app.key)!;

  test(`${app.key}: serves its own manifest, icons and page metadata`, async ({ request, page }) => {
    const res = await request.get(`${app.url}/manifest.webmanifest`); // no session: browsers fetch it without cookies
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const m = await res.json();
    expect(m).toMatchObject({ id: '/', name: app.name, short_name: app.short, start_url: '/', scope: '/', display: 'standalone', theme_color: app.theme, background_color: app.background });
    expect(JSON.stringify(m)).not.toContain(other.key);

    expect(m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes} ${i.purpose ?? 'any'}`).sort()).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
      const img = await request.get(`${app.url}${icon.src}`);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()['content-type']).toBe('image/png');
      expect(pngSize(await img.body()), icon.src).toBe(icon.sizes);
    }
    // The other app's identity is not on this origin.
    expect((await request.get(`${app.url}/icons/${other.key}-192.png`)).status()).toBe(404);

    await page.goto(`${app.url}/login`);
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', app.theme);
    await expect(page.locator('meta[name=application-name]')).toHaveAttribute('content', app.name);
    await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute('content', app.short);
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/);
    const touch = await request.get(new URL((await page.locator('link[rel=apple-touch-icon]').getAttribute('href'))!, app.url).href);
    expect(pngSize(await touch.body())).toBe('180x180');
    const fav = await request.get(new URL((await page.locator('link[rel=icon]').first().getAttribute('href'))!, app.url).href);
    expect(pngSize(await fav.body())).toBe('32x32');

    // Chromium's own verdict (what DevTools > Application shows): the manifest parses cleanly and nothing blocks
    // installation. Test browsers run in a private profile, which is the one blocker reported and not about the app.
    await workerReady(page);
    const cdp = await page.context().newCDPSession(page);
    expect((await cdp.send('Page.getAppManifest')).errors).toEqual([]);
    const blockers = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.map((e) => e.errorId);
    expect(blockers.filter((id) => id !== 'in-incognito')).toEqual([]);
  });

  test(`${app.key}: the service worker covers its origin, caches only the offline screen and icons, and cleans up after an update`, async ({ page, request }) => {
    const sw = await request.get(`${app.url}/sw.js`);
    expect(sw.headers()['content-type']).toContain('javascript');
    expect(sw.headers()['cache-control']).toContain('no-cache'); // re-checked on every visit: a deployment is picked up promptly
    const source = await sw.text();
    expect(source).toContain(`gs-${app.key}-`);
    expect(source).not.toContain(`gs-${other.key}-`);
    expect(source).not.toMatch(/cache\.put|\.add\(/); // nothing fetched at run time is stored

    await page.goto(`${app.url}/login`);
    expect(await workerReady(page)).toEqual({ scope: `${app.url}/`, script: `${app.url}/sw.js` });
    await expect.poll(async () => Object.values(await cached(page)).flat()).toEqual(shell(app.key));
    const [name] = Object.keys(await cached(page));
    expect(name).toMatch(new RegExp(`^gs-${app.key}-`));

    // A new worker version (what a deployment brings) drops this app's older caches and leaves anything else alone.
    await page.evaluate(async (k) => {
      await caches.open(`gs-${k}-older`);
      await caches.open('someone-elses-cache');
      await (await navigator.serviceWorker.getRegistration())!.unregister();
    }, app.key);
    await page.reload();
    await workerReady(page);
    await expect.poll(async () => Object.keys(await cached(page)).sort()).toEqual([name, 'someone-elses-cache'].sort());
    expect((await page.evaluate(() => navigator.serviceWorker.getRegistrations())).length).toBe(1); // never a second worker
  });
}

test('admin: signed-in pages are never cached; offline shows the offline screen and signing in is still required', async ({ page, context }) => {
  const u = await userWithRoles('pwa-admin', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await hydrated(page);
  await workerReady(page);

  for (const path of ['/', '/orders', '/settings']) {
    const res = await page.goto(`${ADMIN}${path}`);
    expect(res!.headers()['cache-control'], path).toContain('no-store');
  }
  await hydrated(page);
  expect(Object.values(await cached(page)).flat()).toEqual(shell('admin')); // still only the public shell

  // "Install the app" lives in Settings. Chromium under test makes no install offer, so the steps are shown instead.
  await expect(page.getByTestId('install-app')).toHaveAttribute('data-state', 'other');

  await context.setOffline(true);
  await expect(page.getByTestId('offline-banner')).toContainText('Changes cannot be saved until you are back online.');
  await page.goto(`${ADMIN}/orders`).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(page).toHaveTitle('Offline · Greenscape Admin');
  await expect(page.getByRole('link', { name: 'Retry connection' })).toBeVisible();
  await expect.poll(() => page.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(192); // the app icon, from its installed copy
  await expect(page.getByText(u.email)).toHaveCount(0); // the offline screen knows nothing about the person
  expect(new URL(page.url()).pathname).toBe('/orders'); // the address is kept, so retrying opens what was asked for

  await context.setOffline(false);
  await page.getByRole('link', { name: 'Retry connection' }).click();
  await expect(page.getByRole('heading', { name: 'You are offline' })).toHaveCount(0);
  await expect(page).toHaveURL(`${ADMIN}/orders`);

  // The worker is no way around sign-in: without a session every page still goes to the login screen.
  await context.clearCookies();
  await page.goto(`${ADMIN}/orders`);
  await expect(page).toHaveURL(/\/login\?next=%2Forders/);
});

test('employee: attendance needs a connection, nothing is queued, and the install option is offered honestly', async ({ page, context }) => {
  const e = await employeeUser(`${tag}-emp`);
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, e.email);
  const clock = page.getByRole('button', { name: 'Clock in' });
  await expect(clock).toBeEnabled();
  await hydrated(page);
  await workerReady(page);

  await context.setOffline(true);
  await expect(clock).toBeDisabled();
  await expect(page.getByTestId('clock-offline')).toHaveText('Internet connection is required to record attendance.');
  await expect(page.getByTestId('offline-banner')).toContainText('Internet connection is required to record attendance.');
  await expect(page.getByTestId('clock-confirmed')).toHaveCount(0);
  await expect(page.getByTestId('attendance-state')).toHaveText('Not clocked in');

  await context.setOffline(false);
  await expect(clock).toBeEnabled();
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('attendance-state')).toHaveText('Not clocked in'); // nothing was sent while offline
  expect(Object.values(await cached(page)).flat()).toEqual(shell('employee'));

  // Install: no button until the browser makes an offer; a declined offer is not reported as installed.
  await page.goto(`${EMPLOYEE}/profile`);
  await hydrated(page);
  const install = page.getByTestId('install-app');
  await expect(install).toHaveAttribute('data-state', 'other');
  await expect(install.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => { // what Chrome dispatches when the app is installable (simulated: see docs/pwa/testing.md)
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(offer);
  });
  await expect(install).toHaveAttribute('data-state', 'available');
  await install.getByRole('button', { name: 'Install app' }).click();
  await expect(install).toHaveAttribute('data-state', 'other');
  await expect(install).toContainText('Not installed.');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toHaveAttribute('data-state', 'installed');
});

test('both apps fit phones, tablets and desktops without sideways scrolling', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'sets its own viewports');
  test.setTimeout(180_000);
  const [staff, e] = await Promise.all([userWithRoles('pwa-fit', ['admin']), employeeUser(`${tag}-fit`)]);
  const visits: [string, string, string[]][] = [[ADMIN, staff.email, ['/', '/settings', '/notifications']], [EMPLOYEE, e.email, ['/', '/attendance', '/schedule', '/requests', '/profile']]];
  for (const [base, who, paths] of visits) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await signIn(page, who);
    await expect(page).not.toHaveURL(/\/login/); // the employee sign-in returns before the redirect lands
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of paths) {
        await page.goto(`${base}${path}`);
        await hydrated(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${base}${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
      if (base === EMPLOYEE) await expect(page.getByTestId('bottom-nav')).toBeVisible({ visible: width < 768 });
    }
    await context.close();
  }
});
