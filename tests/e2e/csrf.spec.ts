import { expect, test } from '@playwright/test';
import { WEB, confirmedUser, signIn } from './helpers';

// Cookie-authenticated changes on the website and admin are Next.js server actions. Next refuses an action whose
// Origin doesn't match the site, so another site can't make a signed-in visitor's browser perform one (CSRF). The API
// itself takes bearer tokens, not cookies, so a cross-site request reaching it carries no credentials.
test.skip(({ isMobile }) => isMobile, 'one pass is enough');

test('a server action from a foreign origin is refused; the same action from the site works', async ({ page }) => {
  const u = await confirmedUser('csrf');
  await page.goto(`${WEB}/login?next=/messages`);
  await signIn(page, u.email);
  await expect(page).toHaveURL(`${WEB}/messages`);

  // Forge the Origin of the action request, as a page on another site would send it.
  const statuses: number[] = [];
  await page.route('**/messages', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
    const res = await route.fetch({ headers: { ...req.headers(), origin: 'https://evil.example' } });
    statuses.push(res.status());
    await route.fulfill({ response: res });
  });
  const forged = `forged-${Date.now()}`;
  await page.getByLabel('Your message').fill(forged);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect.poll(() => statuses.length).toBeGreaterThan(0);
  expect(statuses[0]).toBeGreaterThanOrEqual(400);
  await page.unroute('**/messages');

  await page.reload();
  await expect(page.getByText(forged)).toHaveCount(0); // not stored (the thread may not exist at all yet)

  // Control: the same form from the site itself goes through.
  const genuine = `genuine-${Date.now()}`;
  await page.getByLabel('Your message').fill(genuine);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('my-thread')).toContainText(genuine);
});
