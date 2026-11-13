// Screenshots of the admin and employee portals at the four review widths, for before/after comparison.
// Not part of the normal run: SHOTS=before|after pnpm exec playwright test tests/e2e/shots --project=desktop
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { cleanupEmployees, employeeUser, userWithRoles } from '../fixtures/test-users';
import { ADMIN, EMPLOYEE, hydrated, signIn } from '../helpers';

const run = process.env.SHOTS;
const dir = `docs/screenshots/portal-redesign/${run}`;
// While iterating: SHOTS_WIDTHS=1440 SHOTS_PAGES=dashboard,orders narrows the run.
const WIDTHS = process.env.SHOTS_WIDTHS?.split(',').map(Number) ?? [390, 768, 1024, 1440];
const ONLY = process.env.SHOTS_PAGES?.split(',');

test.skip(!run, 'set SHOTS=before or SHOTS=after');
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);
test.use({ reducedMotion: 'reduce' });
test.beforeAll(() => mkdirSync(dir, { recursive: true }));
test.afterAll(() => cleanupEmployees('Tester shots'));

async function shoot(page: Page, base: string, portal: string, pages: [name: string, path: string][]) {
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console] ${page.url()} ${m.text().slice(0, 600)}`); });
  page.on('pageerror', (e) => console.log(`[pageerror] ${page.url()} ${e.message.slice(0, 300)}`));
  for (const [name, path] of pages.filter(([name]) => !ONLY || ONLY.includes(name))) {
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
      const res = await page.goto(`${base}${path}`);
      if (!res || res.status() >= 400) break; // a page that only exists after the redesign
      await hydrated(page);
      await page.waitForTimeout(400); // fonts and the first notification fetch
      await page.screenshot({ path: `${dir}/${portal}-${name}-${w}.png`, fullPage: true });
    }
  }
}

test('admin portal', async ({ page }) => {
  await shoot(page, ADMIN, 'admin', [['login', '/login']]);
  const u = await userWithRoles('shots-admin', ['super_admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await shoot(page, ADMIN, 'admin', [['dashboard', '/'], ['orders', '/orders'], ['products', '/products'], ['attendance', '/attendance'], ['notifications', '/notifications'], ['settings', '/settings']]);
});

test('employee portal', async ({ page }) => {
  await shoot(page, EMPLOYEE, 'employee', [['login', '/login']]);
  const u = await employeeUser('shots');
  await page.goto(`${EMPLOYEE}/login`);
  await signIn(page, u.email);
  await page.waitForURL(`${EMPLOYEE}/`);
  await shoot(page, EMPLOYEE, 'employee', [['dashboard', '/'], ['attendance', '/attendance'], ['schedule', '/schedule'], ['requests', '/requests'], ['profile', '/profile'], ['notifications', '/notifications']]);
});
