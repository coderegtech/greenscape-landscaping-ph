import { expect, test } from '@playwright/test';

// Read-only checks that a deployment is alive and wired together (docs/deployment/ci-cd-pipeline.md).
const WEB = process.env.E2E_WEB ?? 'http://localhost:3000';
const ADMIN = process.env.E2E_ADMIN ?? 'http://localhost:3001';
const EMPLOYEE = process.env.E2E_EMPLOYEE ?? 'http://localhost:3002';
const API = process.env.E2E_API ?? 'http://localhost:4000';

test('API is healthy: Postgres, MongoDB and Redis all answer', async ({ request }) => {
  const res = await request.get(`${API}/v1/health`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok', checks: { postgres: { ok: true }, mongo: { ok: true }, redis: { ok: true } } });
});

test('every portal answers its health check', async ({ request }) => {
  for (const origin of [WEB, ADMIN, EMPLOYEE]) expect((await request.get(`${origin}/api/health`)).status(), origin).toBe(200);
});

test('website home loads with CMS content and no broken assets', async ({ page }) => {
  const broken: string[] = [];
  page.on('response', (r) => r.status() >= 400 && /\/_next\/|\.(css|js|woff2?|png|jpe?g|webp|avif|svg)(\?|$)/.test(r.url()) && broken.push(`${r.status()} ${r.url()}`));
  await page.goto(WEB);
  await expect(page).toHaveTitle(/Greenscape/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Services come from the CMS through the API: this is the website-to-API-to-MongoDB path.
  await expect(page.getByRole('link', { name: 'Garden Design', exact: true }).first()).toBeVisible();
  await page.waitForLoadState('load');
  expect(broken).toEqual([]);
});

test('main navigation reaches the about page', async ({ page }) => {
  await page.goto(WEB);
  await page.getByRole('link', { name: 'About', exact: true }).first().click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('product catalog loads', async ({ page }) => {
  const res = await page.goto(`${WEB}/shop`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

for (const [name, origin] of [['customer', WEB], ['employee', EMPLOYEE], ['admin', ADMIN]] as const) {
  test(`${name} sign-in page loads`, async ({ page }) => {
    const res = await page.goto(`${origin}/login`);
    expect(res?.status()).toBe(200);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  });
}
