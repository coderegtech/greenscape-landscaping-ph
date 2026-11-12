import { expect, test, type Page } from '@playwright/test';
import { WEB } from './helpers';

// Website-wide botanical accents (apps/web/components/decorations): present on every public page, decorative only,
// never on top of content, moving gently, still under reduced motion, and no overflow, errors or layout shift.
const STORY = '/stories/a-new-digital-home-greenscape-unveils-official-website';
const PROJECT = '/projects/sustainable-landscaping-in-action';
const PAGES = ['/', '/about', '/services', '/services/garden-design', '/services/garden-essentials', '/services/landscaping', '/services/garden-maintenance', '/projects', PROJECT, '/gallery', '/stories', STORY, '/testimonials', '/faq', '/contact', '/quote', '/shop'];
const WIDTHS = [[1440, 900], [768, 1024], [390, 844]] as const;

/** Visible accents that intersect a heading, paragraph, link, button, form control or price (by more than 4px²). */
const overlaps = (page: Page) =>
  page.evaluate(() => {
    // Measure content where it rests: a reveal that has not played holds it invisible up to 20px lower (--reveal-y),
    // inside the band the accents use. RevealLatch sets the same attribute once a reveal has played.
    document.querySelectorAll('[data-reveal], [data-stagger] > *').forEach((e) => e.setAttribute('data-revealed', ''));
    const vis =(e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
    };
    const content = Array.from(document.querySelectorAll('main h1, main h2, main h3, main p, main a, main button, main input, main select, main textarea, main label, main .tabular, footer a, footer p, footer h2'))
      .filter((e) => !e.closest('.ba, [aria-hidden="true"], .sr-only') && vis(e));
    const bad: string[] = [];
    for (const d of Array.from(document.querySelectorAll('.ba'))) {
      if (!vis(d)) continue;
      const a = d.getBoundingClientRect();
      for (const c of content) {
        const b = c.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) bad.push(`${d.parentElement?.tagName}.${(d.parentElement?.className || '').toString().slice(0, 30)} accent ${Array.from(d.parentElement?.children ?? []).indexOf(d)} × ${c.tagName} "${(c.textContent ?? '').trim().slice(0, 30)}"`);
      }
    }
    return bad;
  });

test.describe('botanical accents', () => {
  test('appear on every public page, hidden from assistive tech and from the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'widths are covered below');
    test.setTimeout(180_000);
    for (const path of PAGES) {
      await page.goto(`${WEB}${path}`);
      const accents = page.locator('.ba:visible');
      expect(await accents.count(), path).toBeGreaterThan(2);
      const props = await page.locator('.ba').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-hidden'), getComputedStyle(e).pointerEvents]));
      expect(props.every(([a, p]) => a === 'true' && p === 'none'), path).toBe(true);
    }
  });

  for (const [w, h] of WIDTHS) {
    test(`${w}px: never on top of content, no overflow, no console errors; screenshots`, async ({ page, isMobile }, info) => {
      test.skip(isMobile, 'widths are set explicitly');
      test.setTimeout(240_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
      page.on('console', (m) => m.type() === 'error' && !/status of 40[14]|CORS|Failed to fetch|ERR_FAILED/.test(m.text()) && errors.push(`${page.url()}: ${m.text()}`));
      await page.setViewportSize({ width: w, height: h });
      for (const path of PAGES) {
        await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${path} overflows`).toBeLessThanOrEqual(0);
        expect(await overlaps(page), path).toEqual([]);
        await page.emulateMedia({ reducedMotion: 'reduce' }); // full-page shots: end states, no mid-reveal frames
        await page.screenshot({ path: info.outputPath(`${w}${path === '/' ? '-home' : path.replaceAll('/', '-')}.png`), fullPage: true });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      expect(errors).toEqual([]);
    });
  }

  test('they float and sway on their own timings; the larger ones drift with scroll', async ({ page, isMobile }) => {
    test.skip(isMobile, 'phones show still accents');
    await page.goto(`${WEB}/services`);
    const motion = await page.locator('.ba:visible .ba-art').evaluateAll((els) => els.map((e) => [getComputedStyle(e).animationName, getComputedStyle(e).animationDuration]));
    expect(motion.length).toBeGreaterThan(2);
    expect(motion.every(([n]) => /^ba-(float|sway|drift|fall|pulse)$/.test(n!))).toBe(true);
    expect(new Set(motion.map(([, d]) => d)).size).toBeGreaterThan(1); // not in lockstep
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
    test.skip(!supported, 'scroll timelines not supported');
    const par = page.locator('.ba[data-parallax]:visible').first();
    await par.scrollIntoViewIfNeeded();
    const t1 = await par.evaluate((e) => getComputedStyle(e).translate);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => par.evaluate((e) => getComputedStyle(e).translate)).not.toBe(t1);
  });

  test('phones: only a few, and still', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB}/`);
    const names = await page.locator('.ba:visible .ba-art').evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(names.every((n) => n === 'none')).toBe(true);
    const perSection = await page.locator('section').evaluateAll((ss) => ss.map((s) => Array.from(s.querySelectorAll(':scope > .ba')).filter((d) => getComputedStyle(d).display !== 'none').length));
    expect(Math.max(...perSection)).toBeLessThanOrEqual(1);
  });

  test('reduced motion: no floating and no parallax', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/services`);
    const names = await page.locator('.ba:visible').evaluateAll((els) => els.flatMap((e) => [getComputedStyle(e).animationName, getComputedStyle(e.firstElementChild!).animationName]));
    expect(names.every((n) => n === 'none')).toBe(true);
    await ctx.close();
  });

  test('no layout shift from accents', async ({ page }) => {
    for (const path of ['/', '/projects', '/contact']) {
      await page.goto(`${WEB}${path}`);
      const cls = await page.evaluate(() => new Promise<number>((done) => {
        let sum = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) sum += e.value; }).observe({ type: 'layout-shift', buffered: true });
        window.scrollTo(0, 800);
        setTimeout(() => done(sum), 1500);
      }));
      expect(cls, path).toBeLessThan(0.05);
    }
  });

  test('navigation, gallery and forms still work with accents around them', async ({ page }) => {
    await page.goto(`${WEB}/gallery`);
    await page.getByRole('button', { name: /^Open photo 1 of/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`${WEB}/contact`);
    await page.getByLabel('Full name').fill('Maria Santos');
    await expect(page.getByLabel('Full name')).toHaveValue('Maria Santos');
    await page.goto(`${WEB}/shop`);
    await page.getByRole('list', { name: 'Product list' }).getByRole('link').first().click();
    await expect(page).toHaveURL(/\/shop\/[a-z0-9-]+$/);
  });
});
