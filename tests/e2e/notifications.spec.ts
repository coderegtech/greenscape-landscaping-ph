import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, WEB, confirmedUser, signIn, staffUser } from './helpers';

const badge = (p: Page) => p.getByTestId('notification-badge');
const bell = (p: Page) => p.getByTestId('notification-bell');

async function customerOnMessages(browser: Browser, label: string) {
  const u = await confirmedUser(label);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${WEB}/login?next=/messages`);
  await signIn(page, u.email);
  await expect(page).toHaveURL(`${WEB}/messages`);
  return { ...u, page };
}
async function sendMessage(page: Page, text: string) {
  await page.getByLabel('Your message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Sent. We will reply here and by email.')).toBeVisible();
}

test.describe('notifications', () => {
  test.describe.configure({ mode: 'serial' });

  test('a customer message reaches a signed-in admin live; read state follows them across tabs; a dropped connection catches up', async ({ browser }) => {
    const customer = await customerOnMessages(browser, 'nt-cust');
    const other = await customerOnMessages(browser, 'nt-cust2');
    const staff = await staffUser('nt-admin', ['admin']);
    const adminCtx = await browser.newContext();
    const tab1 = await adminCtx.newPage();
    await tab1.goto(`${ADMIN}/login`);
    await signIn(tab1, staff.email);
    await expect(tab1).toHaveURL(`${ADMIN}/`);
    const tab2 = await adminCtx.newPage(); // the same person's second tab
    await tab2.goto(`${ADMIN}/`);
    await expect(bell(tab1)).toBeVisible();
    await expect(bell(tab2)).toBeVisible();
    await expect(badge(tab1)).toHaveCount(0);

    // Trigger the business event; nobody refreshes anything.
    await sendMessage(customer.page, 'Do you deliver palms to San Jose?');
    await expect(badge(tab1)).toHaveText(/^[1-9]/);
    await expect(badge(tab2)).toHaveText(/^[1-9]/);
    await expect(bell(tab1)).toHaveAccessibleName(/unread/);

    // Open the dropdown: the notification is there with its title, and reading it all clears the badge on the other tab too.
    await bell(tab1).click();
    const dropdown = tab1.getByTestId('notification-dropdown');
    await expect(dropdown.getByText(/New message from/).first()).toBeVisible();
    await tab1.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(badge(tab1)).toHaveCount(0);
    await expect(badge(tab2)).toHaveCount(0); // synchronised across tabs

    // The live connection is cut and the network refuses new ones; a notification arrives meanwhile; once the network is
    // back the page reconnects by itself and the missed notification shows up, with no reload. (Chromium's offline mode
    // does not sever a stream that is already open, so the connection is dropped through the app's own "back online" path.)
    const stream = '**/v1/notifications/stream*';
    await adminCtx.route(stream, (r) => r.abort());
    await tab2.evaluate(() => window.dispatchEvent(new Event('online')));
    await sendMessage(other.page, 'Also, do you sell mulch?'); // another customer (a follow-up in an unread thread would not notify again)
    await expect(badge(tab2)).toHaveCount(0);
    await adminCtx.unroute(stream);
    await expect(badge(tab2)).toHaveText(/^[1-9]/, { timeout: 30_000 });
    await tab1.keyboard.press('Escape');

    // Full notification centre: unread filter, mark one as read by opening it from the list.
    await tab2.goto(`${ADMIN}/notifications`);
    await expect(tab2.getByTestId('notification').first()).toBeVisible();
    await tab2.getByRole('button', { name: 'Unread' }).click();
    await expect(tab2.getByTestId('notification').first()).toHaveAttribute('data-unread', 'true');
    // Admins hold notifications.broadcast, so the announcement tab exists.
    await expect(tab2.getByRole('tab', { name: 'Send an announcement' })).toBeVisible();
    await adminCtx.close();
    await customer.page.context().close();
    await other.page.context().close();
  });

  test("people never see each other's notifications, and without permission there is no announcement form", async ({ browser }) => {
    const a = await customerOnMessages(browser, 'nt-a');
    const b = await customerOnMessages(browser, 'nt-b');
    await expect(bell(a.page)).toBeVisible();
    await expect(badge(a.page)).toHaveText('1'); // the welcome notice: theirs alone
    await sendMessage(a.page, 'A private question that only staff should see.');
    await a.page.goto(`${WEB}/account/notifications`);
    await expect(a.page.getByTestId('notification').filter({ hasText: 'Welcome to Greenscape' })).toBeVisible();
    await expect(a.page.getByRole('tab', { name: 'Send an announcement' })).toHaveCount(0);
    await b.page.goto(`${WEB}/account/notifications`);
    await expect(b.page.getByTestId('notification')).toHaveCount(1); // only b's own welcome
    await expect(b.page.getByText('A private question')).toHaveCount(0);
    await a.page.context().close();
    await b.page.context().close();
  });

  test('alerts blocked by the browser are explained, never forced; the centre has no accessibility violations', async ({ browser }) => {
    test.skip(!process.env.VAPID_PUBLIC_KEY, 'Web Push is not configured in this environment (pnpm vapid:keys)'); // without keys the page says push is not set up instead
    const u = await customerOnMessages(browser, 'nt-denied');
    await u.page.context().addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'denied' }));
    await u.page.goto(`${WEB}/account/notifications`);
    await u.page.getByRole('tab', { name: 'Settings' }).click();
    await expect(u.page.getByText(/Alerts are blocked for this site/)).toBeVisible();
    await expect(u.page.getByRole('button', { name: 'Turn on alerts' })).toHaveCount(0);
    // A preference change is saved without a Save button.
    const sound = u.page.getByRole('checkbox', { name: 'Sound: Orders and payments' });
    await sound.click();
    await expect(u.page.getByText('Saved.')).toBeVisible();
    await u.page.reload();
    await u.page.getByRole('tab', { name: 'Settings' }).click();
    await expect(u.page.getByRole('checkbox', { name: 'Sound: Orders and payments' })).not.toBeChecked();
    // Security notices cannot be hidden from the inbox.
    await expect(u.page.getByRole('checkbox', { name: 'In the app: Account and security' })).toBeDisabled();
    const results = await new AxeBuilder({ page: u.page }).analyze();
    expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
    await u.page.context().close();
  });
});
