import { expect, test } from '@playwright/test';
import { WEB } from './helpers';

// Home botanical hero: content and actions work, decorations stay decorative, motion behaves (breeze, scroll,
// pointer) and stops under reduced motion; no overflow at any width; footer theme; cart icon only in the shop.

test('headline, sentence and actions are present and work; decorations are hidden from assistive tech', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Green today, greener tomorrow.');
  const decos = page.locator('[data-hero] .bh-deco');
  expect(await decos.count()).toBeGreaterThan(6);
  expect(await decos.evaluateAll((els) => els.every((e) => e.getAttribute('aria-hidden') === 'true'))).toBe(true);
  await page.locator('[data-hero]').getByRole('link', { name: 'Request a quote' }).click();
  await expect(page).toHaveURL(`${WEB}/quote`);
});

test('decorations breathe and drift with scroll; the text fades as the page scrolls', async ({ page, isMobile }) => {
  await page.goto(`${WEB}/`);
  await page.waitForTimeout(2600); // entrance done
  const art = page.locator('[data-hero] .bh-deco:visible > svg').first();
  expect(await art.evaluate((e) => getComputedStyle(e).animationName)).toContain('bh-breeze');
  const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
  test.skip(!supported, 'scroll timelines not supported in this browser');
  const deco = page.locator('[data-hero] .bh-front:visible').first();
  const before = await deco.evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  await page.mouse.wheel(0, 500);
  await expect.poll(async () => deco.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)).toBeLessThan(before - (isMobile ? 5 : 30));
  await expect.poll(async () => Number(await page.locator('.bh-text').evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
});

test('decorations lean towards the pointer on desktop only', async ({ page, isMobile }) => {
  await page.goto(`${WEB}/`);
  await page.waitForLoadState('networkidle');
  const hero = page.locator('[data-hero]');
  const box = (await hero.boundingBox())!;
  // inside the visible part of the hero (it is taller than the viewport)
  await page.mouse.move(box.x + box.width * 0.8, 300);
  await page.mouse.move(box.x + box.width * 0.85, 360);
  const mx = () => hero.evaluate((e) => e.style.getPropertyValue('--mx'));
  if (isMobile) expect(await mx()).toBe('');
  else await expect.poll(mx).toMatch(/^-?\d+(\.\d+)?px$/);
});

test('reduced motion: decorations and text are still', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/`);
  const names = await page.locator('[data-hero] .bh-deco').evaluateAll((els) => els.map((e) => getComputedStyle(e.firstElementChild!).animationName));
  expect(names.every((n) => n === 'none')).toBe(true);
  expect(await page.locator('.bh-text').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await page.mouse.move(400, 400);
  expect(await page.locator('[data-hero]').evaluate((e) => e.style.getPropertyValue('--mx'))).toBe('');
  await ctx.close();
});

for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]] as const) {
  test(`no horizontal overflow and headline + actions on the first screen at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${WEB}/`);
    await page.waitForTimeout(1800);
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(w);
    const cta = (await page.locator('[data-hero]').getByRole('link', { name: 'Request a quote' }).boundingBox())!;
    expect(cta.y + cta.height).toBeLessThanOrEqual(h);
  });
}

test('footer is the forest band; the cart icon appears only in the shop', async ({ page }) => {
  await page.goto(`${WEB}/`);
  expect(await page.locator('footer').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(30, 58, 40)');
  await expect(page.getByRole('link', { name: /^Cart,/ })).toHaveCount(0);
  await page.goto(`${WEB}/shop`);
  await expect(page.getByRole('link', { name: /^Cart,/ })).toBeVisible();
});
