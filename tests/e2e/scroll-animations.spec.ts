import { expect, test, type Page } from '@playwright/test';
import { WEB } from './helpers';

// Website-wide scroll reveals (packages/ui/src/motion/reveal.tsx, theme.css, reveal-latch.tsx; docs/ui-ux/scroll-animations.md):
// below-the-fold content starts hidden and arrives as it is scrolled to, is never left hidden, never fades out again
// when scrolling back up, parallax stays inside its frame, and nothing overflows or logs errors.
const STORY = '/stories/a-new-digital-home-greenscape-unveils-official-website';
const PROJECT = '/projects/sustainable-landscaping-in-action';
const PAGES = ['/', '/about', '/services', '/services/garden-design', '/services/garden-essentials', '/services/landscaping', '/services/garden-maintenance', '/projects', PROJECT, '/gallery', '/stories', STORY, '/testimonials', '/faq', '/contact', '/quote', '/shop'];
const WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]] as const;
const REVEALS = '[data-reveal], [data-stagger] > *';

/** Reveals with a box (hidden breakpoints excluded), with where they sit and how opaque they are. */
const reveals = (page: Page) =>
  page.locator(REVEALS).evaluateAll((els) =>
    els
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .map(({ e, r }) => ({ top: r.top, bottom: r.bottom, opacity: Number(getComputedStyle(e).opacity), latched: e.hasAttribute('data-revealed'), name: `${e.tagName.toLowerCase()} "${(e.textContent ?? '').trim().slice(0, 40)}"` })),
  );

/** Scrolls in half-screen steps (lets the frame and IntersectionObserver settle), checking `each` on the way. */
async function sweep(page: Page, direction: 'down' | 'up', each: () => Promise<void>) {
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate((d) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (d === 'down' ? scrollY >= max - 1 : scrollY <= 0) return true;
      scrollBy({ top: (d === 'down' ? 1 : -1) * innerHeight * 0.5, behavior: 'instant' });
      return false;
    }, direction);
    await page.waitForTimeout(120);
    await each();
    if (done) return;
  }
}

test.describe('scroll animations', () => {
  for (const [w, h] of WIDTHS) {
    test(`${w}px: reveal on the way down, stay on the way up, no overflow or errors`, async ({ page, isMobile }, info) => {
      test.skip(isMobile, 'widths are set explicitly');
      test.setTimeout(600_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
      page.on('console', (m) => (m.type() === 'error' || /hydrat/i.test(m.text())) && !/status of 40[14]|CORS|Failed to fetch|ERR_FAILED/.test(m.text()) && errors.push(`${page.url()}: ${m.text()}`));
      await page.setViewportSize({ width: w, height: h });

      const product = await (async () => {
        await page.goto(`${WEB}/shop`);
        return page.locator('main a[href^="/shop/"]').first().getAttribute('href');
      })();
      for (const path of [...PAGES, ...(product ? [product] : [])]) {
        await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
        await expect(page.locator('main h1').first(), `${path}: first section renders`).toBeVisible();

        // Below the fold, at least one reveal is waiting (pages taller than two screens).
        const tall = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 2);
        const start = await reveals(page);
        if (tall) expect(start.some((r) => r.top > h && r.opacity < 1), `${path}: a reveal waits below the fold`).toBe(true);

        // Parallax layers sit inside a clipping frame, so they never spill over neighbouring content.
        const unclipped = await page.locator('.gs-parallax').evaluateAll((els) => els.filter((e) => !/clip|hidden/.test(getComputedStyle(e.parentElement!).overflow)).length);
        expect(unclipped, `${path}: parallax outside a clipping frame`).toBe(0);

        await sweep(page, 'down', async () => {
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${path} overflows`).toBeLessThanOrEqual(0);
        });
        if (w === 1440 || w === 390) await info.attach(`${w}${path.replaceAll('/', '_') || '_home'}.png`, { body: await page.screenshot(), contentType: 'image/png' });
        // At the bottom, every reveal on the page has played.
        const hidden = (await reveals(page)).filter((r) => r.opacity < 1);
        expect(hidden.map((r) => r.name), `${path}: still hidden at the bottom`).toEqual([]);

        // Back up: anything on screen, even half below the fold, stays fully visible (the latch).
        await sweep(page, 'up', async () => {
          const faded = (await reveals(page)).filter((r) => r.bottom > 0 && r.top < h && r.opacity < 1);
          expect(faded.map((r) => r.name), `${path}: faded out on the way up`).toEqual([]);
        });
      }
      expect(errors).toEqual([]);
    });
  }

  test('reduced motion: every reveal is already at its end state, nothing scroll-linked moves', async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/about', '/services/garden-design', STORY, '/shop']) {
      await page.goto(`${WEB}${path}`);
      const moving = await page.locator(`${REVEALS}, .gs-parallax`).evaluateAll((els) =>
        els.filter((e) => { const s = getComputedStyle(e); return Number(s.opacity) < 1 || s.transform !== 'none' || s.translate !== 'none'; }).length,
      );
      expect(moving, path).toBe(0);
    }
    await ctx.close();
  });

  test('content is complete with JavaScript off', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    // Scroll-driven CSS needs no script: the last reveals have played at the bottom of the page.
    await expect(page.locator(REVEALS).last()).toHaveCSS('opacity', '1');
    await expect(page.getByRole('link', { name: 'Request a quote' }).last()).toBeVisible();
    await ctx.close();
  });

  test('revealed calls to action still navigate', async ({ page }) => {
    await page.goto(`${WEB}/`);
    const band = page.locator('[data-reveal]').filter({ has: page.getByRole('link', { name: 'Request a quote' }) }).last();
    await band.scrollIntoViewIfNeeded();
    await expect(band).toHaveCSS('opacity', '1');
    await band.getByRole('link', { name: 'Request a quote' }).click();
    await expect(page).toHaveURL(/\/quote$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
