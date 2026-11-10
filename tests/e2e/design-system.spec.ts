import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN, WEB } from './helpers';

const PAGES = [`${WEB}/design`, `${WEB}/`, `${WEB}/login`, `${WEB}/signup`, `${WEB}/forgot-password`, `${ADMIN}/login`];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  // measure end states: reveals fade in on load and axe would read mid-fade contrast
  test.use({ reducedMotion: 'reduce' });
  for (const url of PAGES) {
    test(`no serious or critical violations: ${url.replace(/http:\/\/localhost:/, ':')}`, async ({ page }) => {
      await page.goto(url);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
    });
  }
});

test.describe('motion is optional', () => {
  test('content is visible with JavaScript off', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/design`);
    // Reveals are CSS scroll animations: with no JavaScript at all, each one is fully visible once scrolled to.
    for (const el of await page.locator('[data-reveal]').all()) {
      await el.scrollIntoViewIfNeeded();
      await expect(el).toHaveCSS('opacity', '1');
    }
    await expect(page.getByRole('heading', { name: 'Four ways we work' })).toBeVisible();
    await ctx.close();
  });

  test('reduced motion shows every reveal at its end state without scrolling', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/design`);
    const offscreen = page.locator('[data-reveal="mask"]').first();
    await expect(offscreen).toHaveCSS('opacity', '1');
    await expect(offscreen).toHaveCSS('clip-path', 'none');
    await ctx.close();
  });

  test('reveals hide below the fold and appear when scrolled to', async ({ page }) => {
    await page.goto(`${WEB}/design`);
    // The last item: the split hero (2026-11 redesign) is shorter, so the first one can start on screen.
    const item = page.locator('#index').locator('xpath=ancestor::section').locator('li[data-reveal]').last();
    expect(Number(await item.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
    await item.scrollIntoViewIfNeeded();
    await expect(item).toHaveCSS('opacity', '1');
  });
});

test.describe('navigation', () => {
  test('skip link is the first tab stop and jumps to main', async ({ page }) => {
    await page.goto(`${WEB}/design`);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('desktop menus open from the keyboard and close with Escape, returning focus', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop nav');
    await page.goto(`${WEB}/design`);
    const trigger = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Services' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Garden design' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Garden design' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('mobile menu sheet opens, lists every section and closes with Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile nav');
    await page.goto(`${WEB}/design`);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    for (const name of ['Services', 'Projects', 'Shop', 'Stories', 'About', 'Contact']) await expect(dialog.getByRole('link', { name, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('responsive', () => {
  for (const width of [390, 768, 1024, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}/design`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('hero headline, sentence and action fit the first screen at 1280×800', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop fold');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${WEB}/design`);
    const action = page.getByRole('link', { name: 'See the tokens' });
    const box = await action.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(800);
  });
});

test('toast and dialog work and are announced', async ({ page }) => {
  await page.goto(`${WEB}/design`);
  await page.getByRole('button', { name: 'Open dialog' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove this plant?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Removed from cart')).toBeVisible();
});
