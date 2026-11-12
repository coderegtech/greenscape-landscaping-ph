import { expect, test } from '@playwright/test';
import { ADMIN, EMPLOYEE, WEB } from '../helpers';

// Visual regression for the public look and the three sign-in screens. Run with `pnpm test:visual`; refresh baselines
// after an intended design change with `pnpm test:visual --update-snapshots`. Baselines are per platform (Playwright adds
// -win32 / -linux to the file names), so each OS keeps its own and CI does not run these.
test.use({ reducedMotion: 'reduce' });

const PAGES: [string, string][] = [
  ['home', `${WEB}/`],
  ['services', `${WEB}/services`],
  ['projects', `${WEB}/projects`],
  ['shop', `${WEB}/shop`],
  ['contact', `${WEB}/contact`],
  ['web-login', `${WEB}/auth/login`],
  ['admin-login', `${ADMIN}/login`],
  ['employee-login', `${EMPLOYEE}/login`],
];

for (const [name, url] of PAGES) {
  test(`${name} looks the same`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);
    // Let lazy photos above the fold finish decoding so the shot is not half-loaded.
    await page.waitForFunction(() => Array.from(document.images).filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete));
    await expect(page).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02, // anti-aliasing and photo decoding differ slightly run to run
      mask: [page.locator('[data-testid=cart-count], [aria-label^="Notifications"]')],
    });
  });
}
