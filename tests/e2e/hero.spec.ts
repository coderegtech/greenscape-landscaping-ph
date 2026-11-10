import { expect, test } from '@playwright/test';
import { WEB } from './helpers';

// Home botanical hero: content and actions work, decorations stay decorative, motion behaves (breeze, scroll,
// pointer) and stops under reduced motion; no overflow at any width; footer theme; cart icon only in the shop.

test('headline, sentence and action are present and work; decorations are hidden from assistive tech', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Green today, greener tomorrow.');
  const decos = page.locator('[data-hero] .bh-deco');
  expect(await decos.count()).toBeGreaterThan(6);
  expect(await decos.evaluateAll((els) => els.every((e) => e.getAttribute('aria-hidden') === 'true'))).toBe(true);
  // The quote CTA is in the header only; the hero keeps one action.
  await expect(page.locator('[data-hero]').getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
  await page.locator('[data-hero]').getByRole('link', { name: 'See our projects' }).click();
  await expect(page).toHaveURL(`${WEB}/projects`);
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
    const cta = (await page.locator('[data-hero]').getByRole('link', { name: 'See our projects' }).boundingBox())!;
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

test.describe('photo carousel in the arch', () => {
  const slides = (page: import('@playwright/test').Page) => page.locator('[data-hero] [aria-roledescription="slide"]');

  test('shows every hero slide photo, one at a time, with dots and a pause button', async ({ page }) => {
    await page.clock.install();
    await page.goto(`${WEB}/`);
    const carousel = page.getByRole('group', { name: 'Garden photographs' });
    const n = await slides(page).count();
    expect(n).toBeGreaterThan(1);
    await expect(carousel.getByRole('button', { name: /^Show photo \d+ of \d+$/ })).toHaveCount(n);
    await expect(slides(page).nth(0)).toHaveAttribute('aria-hidden', 'false');
    // Auto-advance (5.5 s) with the pointer away from the hero.
    await page.mouse.move(2, 2);
    await page.clock.runFor(6000);
    await expect(slides(page).nth(1)).toHaveAttribute('aria-hidden', 'false');
    await expect(slides(page).nth(0)).toHaveAttribute('aria-hidden', 'true');
    // A dot jumps straight to its photo.
    await carousel.getByRole('button', { name: `Show photo ${n} of ${n}` }).click();
    await expect(slides(page).nth(n - 1)).toHaveAttribute('aria-hidden', 'false');
    await expect(carousel.getByRole('button', { name: `Show photo ${n} of ${n}` })).toHaveAttribute('aria-current', 'true');
    // Paused: nothing moves.
    await carousel.getByRole('button', { name: 'Pause slideshow' }).click();
    await page.mouse.move(2, 2);
    await page.clock.runFor(12_000);
    await expect(slides(page).nth(n - 1)).toHaveAttribute('aria-hidden', 'false');
    await expect(carousel.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
  });

  test('reduced motion: no auto-play until the visitor presses play', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.clock.install();
    await page.goto(`${WEB}/`);
    await expect(page.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
    await page.clock.runFor(12_000);
    await expect(slides(page).nth(0)).toHaveAttribute('aria-hidden', 'false');
    await ctx.close();
  });
});

test('cursor ring follows a mouse and reacts to links; none on touch or reduced motion', async ({ page, isMobile, browser }) => {
  await page.goto(`${WEB}/`);
  const ring = page.locator('.gs-cursor');
  if (isMobile) {
    await expect(ring).toBeHidden();
    return;
  }
  // Keep moving until hydration has attached the listener.
  let x = 600;
  await expect.poll(async () => { await page.mouse.move((x += 7), 500); return ring.getAttribute('data-state'); }).toMatch(/^(on|link|view)$/);
  const link = page.getByRole('banner').getByRole('link', { name: 'Request a quote' });
  const b = (await link.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(ring).toHaveAttribute('data-state', 'link');
  await expect.poll(() => ring.evaluate((e) => e.style.translate)).toMatch(/px/);
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const still = await ctx.newPage();
  await still.goto(`${WEB}/`);
  await still.mouse.move(600, 500);
  await expect(still.locator('.gs-cursor')).toBeHidden();
  await ctx.close();
});

test('scrollbar uses the site colours', async ({ page }) => {
  await page.goto(`${WEB}/`);
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
  expect(color).toBe('rgb(140, 166, 138) rgb(248, 250, 247)');
});
