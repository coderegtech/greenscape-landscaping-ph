import { expect, test, type Page } from '@playwright/test';
import { WEB } from './helpers';

// 2026-11 redesign: masonry, lightbox, filters, header, motion, and a screenshot sweep of the public pages.
const PROJECT = '/projects/sustainable-landscaping-in-action';
const STORY = '/stories/a-new-digital-home-greenscape-unveils-official-website';
const PUBLIC = ['/', '/services', '/services/garden-design', '/projects', PROJECT, '/gallery', '/stories', STORY, '/testimonials', '/about', '/faq', '/contact', '/quote', '/shop'];

/** Distinct column positions of the cards in the first masonry grid. */
const columns = (page: Page) =>
  page.locator('.gs-masonry').first().evaluate((ul) => new Set(Array.from(ul.children).map((li) => Math.round(li.getBoundingClientRect().left))).size);

test.describe('masonry', () => {
  test('cards keep their photos’ natural proportions and reserve the space before load', async ({ page }) => {
    await page.goto(`${WEB}/projects`);
    const cards = page.getByRole('list', { name: 'Project list' }).getByRole('listitem');
    expect(await cards.count()).toBeGreaterThan(4);
    // Space is reserved by the server markup: every frame has its height before any image decodes.
    const frames = await page.locator('.gs-card-media').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(frames.every((h) => h > 40)).toBe(true);
    // Once loaded, each frame's ratio matches the photo's own ratio (no cropping to equal heights).
    for (const img of await page.locator('.gs-card-media img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      const [frame, natural] = await img.evaluate((i: HTMLImageElement) => {
        const r = i.closest('.gs-card-media')!.getBoundingClientRect();
        return [r.height / r.width, i.naturalHeight / i.naturalWidth];
      });
      expect(Math.abs(frame - natural) / natural).toBeLessThan(0.02);
    }
    const heights = new Set(frames.map((h) => Math.round(h)));
    expect(heights.size).toBeGreaterThan(1); // true masonry: not one uniform height
  });

  for (const [width, n] of [[390, 2], [768, 3], [1024, 4], [1440, 5]] as const) {
    test(`${n} columns at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB}/projects`);
      expect(await columns(page)).toBe(n);
    });
  }

  test('reading and tab order follow the DOM, left to right', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop columns');
    await page.goto(`${WEB}/projects`);
    const xs = await page.locator('.gs-masonry > li').evaluateAll((lis) => lis.slice(0, 4).map((li) => li.getBoundingClientRect().left));
    expect(xs).toEqual([...xs].sort((a, b) => a - b)); // the first row runs left to right
  });

  test('cards below the fold reveal once as they scroll in', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await page.goto(`${WEB}/projects`);
    const last = page.locator('.gs-masonry > li').last();
    await expect(last).toHaveAttribute('data-pending', '');
    await last.scrollIntoViewIfNeeded();
    await expect(last).not.toHaveAttribute('data-pending', '');
    await expect(last).toHaveCSS('opacity', '1');
    // Cards on the first screen were never hidden.
    await expect(page.locator('.gs-masonry > li').first()).not.toHaveAttribute('data-pending', '');
  });

  test('home shows featured projects as masonry', async ({ page }) => {
    await page.goto(WEB);
    const grid = page.getByRole('list', { name: 'Gardens we have built' });
    const n = await grid.getByRole('listitem').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(8);
  });

  test('touch screens show the title without hover', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch device');
    await page.goto(`${WEB}/projects`);
    await expect(page.locator('.gs-card-info').first()).toHaveCSS('opacity', '1');
  });
});

test.describe('filters', () => {
  test('category and location filters narrow the projects and combine', async ({ page }) => {
    await page.goto(`${WEB}/projects`);
    const all = await page.locator('.gs-masonry > li').count();
    await page.getByRole('navigation', { name: 'Project categories' }).getByRole('link', { name: 'Commercial landscaping' }).click();
    await expect(page).toHaveURL(/category=commercial-landscaping/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commercial landscaping');
    const metas = await page.locator('.gs-card-meta').allTextContents();
    expect(metas.length).toBeLessThan(all);
    expect(metas.every((m) => m.startsWith('Commercial landscaping'))).toBe(true);

    await page.getByRole('navigation', { name: 'Project locations' }).getByRole('link', { name: 'El Nido' }).click();
    await expect(page).toHaveURL(/category=commercial-landscaping.*place=el-nido|place=el-nido.*category=commercial-landscaping/);
    await expect(page.getByRole('navigation', { name: 'Project locations' }).getByRole('link', { name: 'El Nido' })).toHaveAttribute('aria-current', 'page');
    const placed = await page.locator('.gs-card-meta').allTextContents();
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.every((m) => m.includes('El Nido'))).toBe(true);
  });
});

test.describe('lightbox', () => {
  test('keyboard: arrows move, focus is trapped, Escape closes and restores focus', async ({ page }) => {
    await page.goto(`${WEB}/gallery`);
    const first = page.getByRole('button', { name: /^Open photo 1 of \d+/ });
    await first.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft'); // wraps to the last photo
    await expect(dialog.getByText(/^(\d+) \/ \1$/)).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });

  test('swipe moves to the next photo', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await page.goto(`${WEB}/gallery`);
    await page.getByRole('button', { name: /^Open photo 1 of/ }).click();
    const dialog = page.getByRole('dialog');
    const box = (await dialog.locator('.touch-pan-y').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
  });

  test('project pages open every photo, the cover included', async ({ page }) => {
    await page.goto(`${WEB}${PROJECT}`);
    const photos = page.getByRole('list', { name: /Photos of/ }).getByRole('button');
    const count = page.getByRole('list', { name: 'Project facts' }).getByRole('listitem').last();
    await expect(count).toHaveText(`${await photos.count()} photos`);
    await photos.first().click();
    await expect(page.getByRole('dialog').getByText(/^1 \/ \d+$/)).toBeVisible();
  });
});

test('project pages share to Facebook, X and LinkedIn, and copy the link', async ({ page, context, browserName }) => {
  await page.goto(`${WEB}${PROJECT}`);
  const share = page.getByRole('complementary', { name: 'Share' });
  const url = encodeURIComponent(`${process.env.WEB_URL ?? 'http://localhost:3000'}${PROJECT}`);
  await expect(share.getByRole('link', { name: /^Facebook/ })).toHaveAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${url}`);
  await expect(share.getByRole('link', { name: /^X/ })).toHaveAttribute('href', new RegExp(`^https://twitter\\.com/intent/tweet\\?url=${url.replace(/[.%]/g, '\\$&')}&text=`));
  await expect(share.getByRole('link', { name: /^LinkedIn/ })).toHaveAttribute('target', '_blank');
  test.skip(browserName !== 'chromium', 'clipboard permission');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await share.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
});

test.describe('header', () => {
  test('stays at the top while scrolling and keeps quote, account and cart', async ({ page, isMobile }) => {
    await page.goto(`${WEB}/projects`);
    await page.mouse.wheel(0, 1500);
    const header = page.locator('header.gs-header');
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
    await expect(header.getByRole('link', { name: 'Your account' })).toBeVisible();
    await expect(header.getByRole('link', { name: /^Cart, \d+ items$/ })).toBeVisible();
    if (!isMobile) await expect(header.getByRole('link', { name: 'Request a quote' })).toBeVisible();
    expect(await header.evaluate((h) => getComputedStyle(h).backgroundColor)).toBe('rgb(255, 255, 255)');
  });

  test('mobile menu opens, traps focus, and returns focus on Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone menu');
    await page.goto(WEB);
    const button = page.getByRole('button', { name: 'Open menu' });
    await button.click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Request a quote' })).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await menu.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('nothing is held back: every card is visible without scrolling to it', async ({ page }) => {
    await page.goto(`${WEB}/projects`);
    await expect(page.locator('[data-pending]')).toHaveCount(0);
    await expect(page.locator('.gs-masonry > li').last()).toHaveCSS('opacity', '1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('transform', 'none');
  });
});

test.describe('public pages at four widths', () => {
  // Full-page captures do not scroll, so reveals below the fold would stay at their start state: shoot end states.
  test.use({ reducedMotion: 'reduce' });
  for (const width of [390, 768, 1024, 1440]) {
    test(`${width}px: no horizontal overflow or console errors, screenshots saved`, async ({ page, isMobile }, info) => {
      test.skip(isMobile, 'widths are set explicitly');
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && !/status of 40[14]/.test(m.text()) && errors.push(`${page.url()}: ${m.text()}`));
      await page.setViewportSize({ width, height: 900 });
      for (const path of PUBLIC) {
        await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} overflows`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: info.outputPath(`${width}${path === '/' ? '-home' : path.replaceAll('/', '-')}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
});
