import { expect, test } from '@playwright/test';
import { WEB } from './helpers';

// Project pages: every photo (the cover included) opens full size; the page can be shared or its link copied.
const PROJECT = '/projects/sustainable-landscaping-in-action';

test('every photo, the cover included, opens in the viewer', async ({ page }) => {
  await page.goto(`${WEB}${PROJECT}`);
  const photos = page.getByRole('list', { name: /Photos of/ }).getByRole('button');
  const count = page.getByRole('list', { name: 'Project facts' }).getByRole('listitem').last();
  await expect(count).toHaveText(`${await photos.count()} photos`);
  await expect(async () => {
    await photos.first().click();
    await expect(page.getByRole('dialog').getByText(/^1 \/ \d+$/)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60_000 }); // the viewer chunk loads on first open
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/projects');
});

test('shares to Facebook, X and LinkedIn, and copies the link', async ({ page, context, browserName }) => {
  await page.goto(`${WEB}${PROJECT}`);
  const share = page.getByRole('complementary', { name: 'Share' });
  const url = encodeURIComponent(`${process.env.WEB_URL ?? 'http://localhost:3000'}${PROJECT}`);
  await expect(share.getByRole('link', { name: /^Facebook/ })).toHaveAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${url}`);
  await expect(share.getByRole('link', { name: /^X/ })).toHaveAttribute('href', new RegExp(`^https://twitter\\.com/intent/tweet\\?url=${url.replace(/[.%]/g, '\\$&')}&text=`));
  await expect(share.getByRole('link', { name: /^LinkedIn/ })).toHaveAttribute('href', `https://www.linkedin.com/sharing/share-offsite/?url=${url}`);
  for (const l of await share.getByRole('link').all()) await expect(l).toHaveAttribute('target', '_blank');
  test.skip(browserName !== 'chromium', 'clipboard permission');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(decodeURIComponent(url));
});
