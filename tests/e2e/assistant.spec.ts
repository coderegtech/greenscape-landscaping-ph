import { expect, test } from '@playwright/test';
import { WEB, hydrated, signedInCustomer } from './helpers';

// The local API answers with the offline mock provider (no API key in development), so replies start "(Test assistant)".

test('a guest who opens the chat is asked to sign in', async ({ page }) => {
  await page.goto(`${WEB}/about`);
  await hydrated(page); // the launcher works once the page has hydrated
  await page.getByTestId('chat-launcher').click();
  await expect(page.getByTestId('sign-in-prompt')).toBeVisible();
  await expect(page.getByTestId('sign-in-prompt').getByText(/chat with our AI assistant/)).toBeVisible();
  await expect(page.getByTestId('sign-in-prompt').getByRole('link', { name: 'Sign in with email' })).toHaveAttribute('href', /next=%2Fabout%3Fintent%3Dchat/);
});

test('a customer chats: AI disclosure, a streamed reply, history, keyboard close', async ({ page }) => {
  await signedInCustomer(page, 'chatter');
  await page.goto(`${WEB}/services`);
  await hydrated(page); // the launcher works once the page has hydrated
  await page.getByTestId('chat-launcher').click();
  const panel = page.getByTestId('chat-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/You are chatting with an AI/)).toBeVisible();
  await expect(panel.getByLabel('Your message')).toBeFocused();

  await panel.getByRole('list', { name: 'Suggested questions' }).getByRole('button').first().click();
  await expect(panel.getByTestId('chat-messages').locator('.chat-bot').last()).toContainText('(Test assistant)', { timeout: 20_000 });
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible(); // the reply finished

  await panel.getByRole('button', { name: 'Your chats' }).click();
  await expect(panel.getByRole('button', { name: /What services do you offer|Do you deliver|plants|quote/ }).first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('chat-launcher')).toBeFocused();

  await page.goto(`${WEB}/account`);
  await expect(page.getByTestId('my-chats').getByRole('listitem')).toHaveCount(1);
});

test('account: profile, an address and a wishlist plant', async ({ page }) => {
  await signedInCustomer(page, 'acct');
  const profile = page.getByTestId('profile-form');
  await profile.getByLabel('Name').fill('Maria Santos');
  await profile.getByLabel('Mobile number').fill('0917 844 3330');
  await profile.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Your details are saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Add an address' }).click();
  const form = page.getByRole('form', { name: 'New address' });
  await form.getByLabel('Recipient').fill('Maria Santos');
  await form.getByLabel('Mobile number').fill('0917 844 3330');
  await form.getByLabel('Street, building or sitio').fill('12 Rizal Avenue');
  await form.getByRole('button', { name: 'Save address' }).click();
  await expect(page.getByTestId('my-addresses')).toContainText('12 Rizal Avenue');

  await page.goto(`${WEB}/shop`);
  await page.locator('a[href^="/shop/"]').filter({ hasNot: page.locator('[href*="?"]') }).first().click();
  await page.getByTestId('wishlist-button').click();
  await expect(page.getByTestId('wishlist-button')).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`${WEB}/account`);
  await expect(page.getByTestId('my-wishlist').getByRole('listitem')).toHaveCount(1);
});
