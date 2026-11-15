import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, signIn, staffUser } from './helpers';

// Admin CMS flows write shared content, so they run once (desktop) rather than per device.
test.skip(({ isMobile }) => isMobile, 'admin CMS flows run on desktop only');

test.beforeEach(async ({ page }) => {
  const u = await staffUser('editor', ['content_manager']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await expect(page.getByTestId('staff-identity')).toBeVisible();
  page.on('dialog', (d) => void d.accept());
});

test('pages can be edited but not added', async ({ page }) => {
  await page.goto(`${ADMIN}/cms/pages`);
  await expect(page.getByRole('heading', { name: 'Pages', level: 2 })).toBeVisible();
  await expect(page.getByRole('link', { name: /^New page/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Import/ })).toHaveCount(0);
  await page.goto(`${ADMIN}/cms/pages/new`);
  await expect(page).toHaveURL(`${ADMIN}/cms/pages`);
  // Other content types still have the button.
  await page.goto(`${ADMIN}/cms/projects`);
  await expect(page.getByRole('link', { name: /^New project/ })).toBeVisible();
});

test('validation errors are shown on the fields', async ({ page }) => {
  await page.goto(`${ADMIN}/cms/projects/new`);
  await page.getByLabel(/^Title/).fill(`Unfinished project ${randomUUID().slice(0, 6)}`);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Some fields need attention')).toBeVisible();
  await expect(page.getByLabel(/^Summary for cards/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(`${ADMIN}/cms/projects/new`);
});
