import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test } from '@playwright/test';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

// A real website visit is counted (cookieless) and the admin's Analytics page shows the report.
test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool; one pass is enough');

test('a website visit is counted and shown in Analytics', async ({ page, browser }) => {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  const path = `/e2e-visit-${randomUUID().slice(0, 8)}`; // unique, so the count is exactly this visit (a 404 page still counts)
  try {
    const visitor = await browser.newContext();
    const site = await visitor.newPage();
    const beacon = site.waitForResponse((r) => r.url().endsWith('/api/collect') && r.request().method() === 'POST');
    await site.goto(`${WEB}${path}`);
    expect((await beacon).status()).toBe(204);
    expect(await visitor.cookies()).not.toContainEqual(expect.objectContaining({ name: expect.stringMatching(/analytic|visitor|_ga/i) }));
    await visitor.close();
    await expect.poll(async () => (await db.analyticsDaily.findMany({ where: { metric: 'pageview', key: path } })).reduce((n, x) => n + x.count, 0)).toBe(1);

    const u = await staffUser('analytics', ['content_manager']);
    await page.goto(`${ADMIN}/login?next=%2Fanalytics`);
    await signIn(page, u.email);
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Most visited pages' })).toBeVisible();
    await expect(page.getByTestId('analytics-totals')).not.toContainText('Paid order value'); // no reports.sales
    await page.getByRole('link', { name: 'Last 7 days' }).click();
    await expect(page).toHaveURL(`${ADMIN}/analytics?days=7`);
  } finally {
    await db.analyticsDaily.deleteMany({ where: { key: path } });
    await db.$disconnect();
  }
});
