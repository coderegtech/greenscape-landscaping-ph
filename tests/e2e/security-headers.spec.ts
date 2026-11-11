import { expect, test, type Page } from '@playwright/test';
import { ADMIN_IA } from '../../apps/admin/lib/nav';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

// Phase 12: both apps send a Content-Security-Policy, and real pages run under it with no violations
// (a violation would mean a blocked script, style, image or request — usually a page that silently stops working).
test.skip(({ isMobile }) => isMobile, 'headers do not depend on the viewport');

// Console messages miss violations a library catches itself (e.g. an eval probe in try/catch), so listen for the
// browser's securitypolicyviolation events too, and read them before every navigation.
function collectViolations(page: Page) {
  const seen: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) seen.push(m.text()); });
  void page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  const drain = async () => { seen.push(...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []))); };
  return { seen, drain };
}

test('public site: CSP and security headers', async ({ page }) => {
  const res = await page.request.get(`${WEB}/`);
  const csp = res.headers()['content-security-policy'] ?? '';
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"]) expect(csp).toContain(d);
  expect(csp).not.toContain('unsafe-eval');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['cross-origin-opener-policy']).toBe('same-origin');

  const { seen: violations, drain } = collectViolations(page);
  for (const path of ['/', '/projects/sustainable-landscaping-in-action', '/shop', '/shop/golden-pothos', '/quote', '/contact', '/auth/login']) {
    await page.goto(`${WEB}${path}`);
    await page.waitForLoadState('networkidle');
    await drain();
  }
  // Hydrated code still runs: the lazily loaded lightbox opens.
  await page.goto(`${WEB}/projects/sustainable-landscaping-in-action`);
  await page.getByRole('button', { name: /^Open photo 1 of/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await drain();
  expect(violations).toEqual([]);
});

test('admin: nonce-based CSP, new nonce per request, no violations', async ({ page }) => {
  test.setTimeout(180_000); // visits every admin page (~25); under full-suite load that exceeds the 90 s default
  const nonceOf = async () => /'nonce-([^']+)'/.exec((await page.request.get(`${ADMIN}/login`)).headers()['content-security-policy'] ?? '')?.[1];
  const [a, b] = [await nonceOf(), await nonceOf()];
  expect(a).toBeTruthy();
  expect(a).not.toBe(b);

  const { seen: violations, drain } = collectViolations(page);
  const u = await staffUser('csp', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await expect(page.getByTestId('staff-identity')).toBeVisible();
  for (const href of ADMIN_IA.flatMap((g) => g.items).filter((i) => i.ready).map((i) => i.href)) {
    await page.goto(`${ADMIN}${href}`);
    await page.waitForLoadState('networkidle');
    await drain();
  }
  expect(violations).toEqual([]);
});
