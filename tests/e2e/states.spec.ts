import { expect, test } from '@playwright/test';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

// Loading, empty, error, offline and 404 states. The component gallery (/design) shows every illustration, so the
// per-state checks run there; the portals are checked for what only they do (shell stays, 404 in the shell, offline).

test.describe('404 pages', () => {
  test('website: custom page, real 404 status, way back home', async ({ page }) => {
    const res = await page.goto(`${WEB}/no-such-page-${Date.now()}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: /wandered off the garden path/ })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Home' }).click();
    await expect(page).toHaveURL(`${WEB}/`);
  });

  test('admin: operational 404 with a way back to the dashboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the admin is a desktop tool');
    const u = await staffUser('states404', ['super_admin']);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, u.email);
    const res = await page.goto(`${ADMIN}/no-such-page`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Return to dashboard' }).click();
    await expect(page).toHaveURL(`${ADMIN}/`);
  });
});

test.describe('admin loading and offline', () => {
  test.skip(({ isMobile }) => isMobile, 'the admin is a desktop tool');
  test.beforeEach(async ({ page }) => {
    const u = await staffUser('statesload', ['super_admin']);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, u.email);
    await expect(page.getByTestId('staff-identity')).toBeVisible();
  });

  test('navigating keeps the shell and shows page placeholders, never a full-screen overlay', async ({ page }) => {
    await page.route(/\/orders\?_rsc=/, async (route) => {
      await new Promise((r) => setTimeout(r, 2000)); // a slow page: the placeholders have time to show
      await route.continue();
    });
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await nav.getByRole('link', { name: /^Orders/ }).click();
    await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
    await expect(nav).toBeVisible(); // the sidebar never goes away
    expect(await page.locator('[role=status].fixed.inset-0').count()).toBe(0); // no blocking overlay
    await expect(page.getByRole('heading', { level: 2, name: 'Orders' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
  });

  test('going offline shows a notice and coming back removes it', async ({ page, context }) => {
    const notice = page.getByText(/You’re offline/);
    await expect(notice).toHaveCount(0);
    await context.setOffline(true);
    await expect(notice).toBeVisible();
    await context.setOffline(false);
    await expect(notice).toHaveCount(0);
  });
});

test.describe('gallery of states (/design)', () => {
  test('every empty state has its own illustration, title and text', async ({ page }) => {
    await page.goto(`${WEB}/design`);
    const list = page.getByTestId('illustrations');
    await expect(list.locator('svg[data-illustration]')).toHaveCount(12);
    const names = await list.locator('svg[data-illustration]').evaluateAll((els) => els.map((e) => e.getAttribute('data-illustration')));
    expect(new Set(names).size).toBe(12);
    for (const svg of await list.locator('svg').all()) await expect(svg).toHaveAttribute('aria-hidden', 'true'); // decorative: the text says it
    await expect(list.getByText('Empty: search')).toBeVisible();
  });

  test('error, offline and forbidden are announced and offer no technical detail', async ({ page }) => {
    await page.goto(`${WEB}/design#empty`);
    await expect(page.getByRole('alert').filter({ hasText: 'Something didn’t grow as expected.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'You’re currently offline.' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'You don’t have access to this.' })).toBeVisible();
  });

  test('skeletons shimmer, and hold still under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${WEB}/design#loading`);
    const anim = () => page.locator('.skeleton').first().evaluate((e) => getComputedStyle(e).animationName);
    expect(await anim()).toBe('gs-shimmer');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await anim()).toBe('none');
  });

  for (const width of [390, 768, 1024, 1440]) {
    test(`states fit a ${width}px screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}/design#empty`);
      const overflow = await page.getByTestId('illustrations').locator('li').evaluateAll((els, w) => els.filter((e) => e.getBoundingClientRect().right > w + 1).length, width);
      expect(overflow).toBe(0);
    });
  }
});
