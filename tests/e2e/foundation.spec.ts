import { expect, test } from '@playwright/test';

const WEB = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';

test('public site renders the shell without console errors or horizontal overflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(WEB);
  await expect(page).toHaveTitle(/Greenscape Landscaping Services/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Green today, greener tomorrow.');
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('web sends security headers', async ({ request }) => {
  const res = await request.get(WEB);
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-powered-by']).toBeUndefined();
});

test('admin shell reaches the API and is not indexable', async ({ page }) => {
  await page.goto(ADMIN);
  await expect(page.getByTestId('api-status')).toHaveText('ok');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
