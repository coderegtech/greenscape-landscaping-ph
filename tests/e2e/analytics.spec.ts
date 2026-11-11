import { expect, test } from '@playwright/test';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

// A real website visit reaches the admin's Analytics page (cookieless counters; nothing stored in the browser).
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

test('a website visit is counted and shown in Analytics', async ({ page, browser }) => {
  const visitor = await browser.newContext();
  const site = await visitor.newPage();
  const beacon = site.waitForResponse((r) => r.url().endsWith('/api/collect') && r.request().method() === 'POST');
  await site.goto(`${WEB}/faq`);
  expect((await beacon).status()).toBe(204);
  expect(await visitor.cookies()).not.toContainEqual(expect.objectContaining({ name: expect.stringMatching(/analytic|visitor|_ga/i) }));
  await visitor.close();

  const u = await staffUser('analytics', ['content_manager']);
  await page.goto(`${ADMIN}/login?next=%2Fanalytics`);
  await signIn(page, u.email);
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Most visited pages' })).toContainText('/faq');
  await expect(page.getByTestId('analytics-totals')).not.toContainText('Paid order value'); // no reports.sales
  await page.getByRole('link', { name: 'Last 7 days' }).click();
  await expect(page).toHaveURL(`${ADMIN}/analytics?days=7`);
});
