import { expect, test, type Page } from '@playwright/test';
import { WEB } from './helpers';

// White botanical redesign: theme, Pinterest-style masonry (natural proportions, columns per width, no overlap,
// reading order), gallery interactions (lightbox, swipe, filters, show more), touch captions, reduced motion.

const cards = (page: Page) => page.getByTestId('masonry').first().locator(':scope > li');

/** Opens the lightbox from a card. A tap before the page hydrates does nothing (the viewer is a client component), so retry. */
async function openPhoto(page: Page, index: number) {
  await expect(async () => {
    await page.locator(`button[data-lightbox-index="${index}"]`).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 }); // the viewer chunk loads on first open
  }).toPass({ timeout: 60_000 }); // the cold image optimiser (AVIF) can keep the server busy while parallel tests load galleries
}

async function rects(page: Page) {
  return cards(page).evaluateAll((els) => els.map((el) => {
    const frame = el.querySelector('.photo-frame')!.getBoundingClientRect();
    return { x: Math.round(frame.left), y: frame.top + window.scrollY, w: frame.width, h: frame.height, ratio: Number((el as HTMLElement).dataset.ratio) };
  }));
}

test('public pages are white with a light header', async ({ page }) => {
  for (const path of ['/', '/gallery', '/projects', '/shop']) {
    await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), path).toBe('rgb(255, 255, 255)');
  }
  const header = await page.locator('header.site-header').evaluate((el) => getComputedStyle(el).position);
  expect(header).toBe('sticky');
});

test.describe('masonry', () => {
  test('cards keep their photo proportions, vary in height and never overlap', async ({ page }) => {
    await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
    const r = await rects(page);
    expect(r.length).toBeGreaterThanOrEqual(8);
    for (const c of r) expect(Math.abs(c.h / c.w - c.ratio) / c.ratio, 'rendered ratio = stored ratio').toBeLessThan(0.03);
    expect(new Set(r.map((c) => Math.round(c.h))).size, 'heights vary').toBeGreaterThan(1);
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i]!, b = r[j]!;
        const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(overlap, `cards ${i} and ${j} overlap`).toBe(false);
      }
  });

  for (const [width, cols] of [[390, 2], [768, 3], [1024, 4], [1440, 4]] as const) {
    test(`${cols} columns at ${width}px, no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/gallery', '/projects']) {
        await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded' });
        expect(new Set((await rects(page)).map((c) => c.x)).size, path).toBe(cols);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
      }
      // Clipped overflow counts too (html clips it, so it never scrolls, but it means something escaped its box): the
      // home film strip once leaked its off-screen cards' sr-only text this way.
      await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
      expect(await page.evaluate(() => document.body.scrollWidth), 'home body width').toBeLessThanOrEqual(width);
    });
  }

  test('keyboard order follows the data, not the columns', async ({ page }) => {
    await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
    await page.locator('button[data-lightbox-index="0"]').focus();
    for (const next of ['1', '2', '3', '4']) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.lightboxIndex)).toBe(next);
    }
  });

  test('project cards link to their project and name it', async ({ page }) => {
    await page.goto(`${WEB}/projects`, { waitUntil: 'domcontentloaded' });
    const first = cards(page).first().getByRole('link');
    const title = (await first.locator('.font-display').first().textContent())!.replace(/,\s*$/, '');
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(first).toHaveAccessibleName(new RegExp(`^${escaped}\\s*, `)); // read as "Title, category, place"
    await first.click();
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  });
});

test.describe('gallery', () => {
  test('lightbox: open, arrows, caption, Escape returns focus', async ({ page }) => {
    await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
    await openPhoto(page, 2);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^3 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText(/^4 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('button[data-lightbox-index="2"]')).toBeFocused();
  });

  test('swipe moves between photos', async ({ page }) => {
    await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
    await openPhoto(page, 0);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    const area = dialog.locator('figure > div').first();
    await area.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 300, clientY: 300, isPrimary: true });
    await area.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 120, clientY: 310, isPrimary: true });
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
  });

  test('filters by category and place; show more keeps earlier photos in place', async ({ page }) => {
    await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
    const status = page.getByRole('status').filter({ hasText: 'photograph' });
    const total = Number((await status.textContent())!.match(/\d+/)![0]);
    expect(await cards(page).count()).toBe(Math.min(24, total));

    if (total > 24) {
      const firstSrc = await cards(page).first().locator('img').getAttribute('src');
      await page.getByRole('link', { name: 'Show more photographs' }).click();
      await expect(page).toHaveURL(/show=48/);
      await expect(cards(page)).toHaveCount(Math.min(48, total));
      expect(await cards(page).first().locator('img').getAttribute('src')).toBe(firstSrc);
    }

    const cat = page.getByRole('navigation', { name: 'Filter by category' }).getByRole('link').nth(1);
    await cat.click();
    await expect(cat).toHaveAttribute('aria-current', 'page');
    const filtered = Number((await status.textContent())!.match(/\d+/)![0]);
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    const place = page.getByRole('navigation', { name: 'Filter by place' }).getByRole('link').nth(1);
    await place.click();
    await expect(place).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/category=.+&place=.+|place=.+&category=.+/);
  });
});

test('touch screens show card captions without hover', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch emulation is on the mobile project');
  await page.goto(`${WEB}/projects`, { waitUntil: 'domcontentloaded' });
  const cap = cards(page).first().locator('.photo-card-cap');
  await expect(cap).toBeVisible();
  expect(Number(await cap.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
});

test('reduced motion: hero and cards are at rest, nothing scroll-animated', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/`);
  const heading = page.getByRole('heading', { level: 1 });
  const [opacity, transform] = await heading.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transform]);
  expect(opacity).toBe('1');
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform); // at rest: no offset
  await page.goto(`${WEB}/gallery`, { waitUntil: 'domcontentloaded' });
  const last = cards(page).last();
  expect(await last.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).animationName])).toEqual(['1', 'none']);
  await ctx.close();
});
