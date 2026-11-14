// Browsers refuse to play audio until the person has interacted with the page. This file runs Chromium with that
// rule switched on explicitly (a launch flag, so it needs its own file) and checks the portal respects it.
import { expect, test, type Page } from '@playwright/test';
import { call, userWithRoles, type TestUser } from './fixtures/test-users';
import { ADMIN, signIn } from './helpers';

test.use({ launchOptions: { args: ['--autoplay-policy=document-user-activation-required'] } });
test.skip(({ isMobile }) => isMobile, 'one pass is enough');

type Heard = Window & { __sounds: string[] };
const listen = (p: Page) => p.addInitScript(() => {
  (window as unknown as Heard).__sounds = [];
  window.addEventListener('gs-sound', (e) => (window as unknown as Heard).__sounds.push((e as CustomEvent<{ name: string }>).detail.name));
});
const sounds = (p: Page) => p.evaluate(() => (window as unknown as Heard).__sounds);
const badge = (p: Page) => p.getByTestId('notification-badge');
const toggle = (p: Page) => p.getByTestId('sound-toggle');

/** A notification for exactly one person: a super admin changes that person's roles (a security notice in their inbox). */
async function notify(by: TestUser, target: TestUser, extraRole: string) {
  const res = await call(`/v1/users/${target.userId}/roles`, by.token, { method: 'PUT', body: JSON.stringify({ roles: ['admin', extraRole] }) });
  expect(res.status, await res.text()).toBe(200);
}

test('a notification is shown silently and without errors; after a click the next one plays', async ({ page }) => {
  const boss = await userWithRoles('pr-boss2', ['super_admin']);
  const a = await userWithRoles('pr-quiet', ['admin']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await listen(page);
  // Sounds were turned on earlier on this browser.
  await page.addInitScript(() => localStorage.setItem('gs-sound:admin', JSON.stringify({ enabled: true, volume: 0.6, style: 'soft', importantOnly: false })));
  await page.goto(`${ADMIN}/login`);
  await signIn(page, a.email);
  await page.goto(`${ADMIN}/`); // a fresh document: no gesture on it yet
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await notify(boss, a, 'content_manager');
  await expect(badge(page)).toHaveText('1');
  await page.waitForTimeout(800);
  expect(await sounds(page)).toEqual([]);
  expect(errors).toEqual([]);

  await page.getByRole('heading', { name: 'Greenscape Admin' }).click(); // the first gesture unlocks audio
  await notify(boss, a, 'hr_manager');
  await expect(badge(page)).toHaveText('2');
  await expect.poll(() => sounds(page)).toEqual(['alert']);
  expect(errors).toEqual([]);
});
