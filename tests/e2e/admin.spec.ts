import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN, WEB, confirmedUser, signIn, staffUser } from './helpers';

test.skip(({ isMobile }) => isMobile, 'admin flows run on desktop');

test('a customer messages Greenscape; staff reply from the admin; the customer sees the reply', async ({ browser, page }) => {
  const text = `Do you have bougainvillea in stock? ${randomUUID().slice(0, 6)}`;
  const customer = await confirmedUser('chat');
  const web = await (await browser.newContext()).newPage(); // separate cookies from the admin session
  await web.goto(`${WEB}/auth/login?next=/messages`);
  await signIn(web, customer.email);
  await expect(web).toHaveURL(`${WEB}/messages`);
  await web.getByLabel('Your message').fill(text);
  await web.getByRole('button', { name: 'Send' }).click();
  await expect(web.getByTestId('my-thread')).toContainText(text);

  const staff = await staffUser('chatstaff', ['content_manager']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, staff.email);
  await expect(page.getByTestId('tile-messages')).toBeVisible();
  await page.goto(`${ADMIN}/messages`);
  const row = page.getByRole('listitem').filter({ hasText: text });
  await expect(row).toContainText('1 unread');
  await row.getByRole('link').click();
  await expect(page.getByTestId('thread')).toContainText(text);
  await page.getByLabel('Reply', { exact: true }).fill('Yes: 3-gallon and 5-gallon pots this week.');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('thread')).toContainText('3-gallon and 5-gallon');

  await web.reload();
  await expect(web.getByTestId('my-thread')).toContainText('3-gallon and 5-gallon');
  await web.context().close();
});

test('new admin pages pass axe (WCAG 2.1 AA)', async ({ page }) => {
  const u = await staffUser('axeadmin', ['admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await expect(page.getByTestId('staff-identity')).toBeVisible();
  for (const path of ['/', '/customers', '/messages', '/messages/contact', '/users', '/settings', '/reports/sales']) {
    await page.goto(`${ADMIN}${path}`);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
});
