import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ADMIN, WEB, signIn, staffUser } from './helpers';

// Admin CMS flows write shared content, so they run once (desktop) rather than per device.
test.skip(({ isMobile }) => isMobile, 'admin CMS flows run on desktop only');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  const u = await staffUser('editor', ['content_manager']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email);
  await expect(page.getByTestId('staff-identity')).toBeVisible();
  page.on('dialog', (d) => void d.accept());
});

test('create a page, preview the draft, publish it, edit it live, archive it', async ({ page, context }) => {
  const id = randomUUID().slice(0, 6);
  const title = `Garden notes ${id}`;
  const slug = `garden-notes-${id}`;

  await page.goto(`${ADMIN}/cms/pages/new`);
  await page.getByLabel('Text page (policy, terms)').check();
  await page.getByLabel(/^Title/).fill(title);
  await expect(page.getByLabel(/^Address/)).toHaveValue(slug);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(`${ADMIN}/cms/pages/${slug}`);
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  // Drafts are not public.
  expect((await page.request.get(`${WEB}/${slug}`)).status()).toBe(404);

  await page.getByRole('button', { name: /^Text$/ }).click();
  await page.getByRole('textbox', { name: 'Text', exact: true }).click();
  await page.keyboard.type('Mulch keeps roots cool through the dry season.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();

  // Preview opens the public site in draft mode with a signed, path-bound link.
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = await popupPromise;
  await expect(preview.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(preview.getByText('Mulch keeps roots cool')).toBeVisible();
  await expect(preview.getByRole('link', { name: 'Exit preview' })).toBeVisible();
  await preview.close();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/^Published\. The site updates/)).toBeVisible();
  const pub = await context.newPage();
  await pub.goto(`${WEB}/${slug}`);
  await expect(pub.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(pub.getByText('Mulch keeps roots cool')).toBeVisible();

  // Edit the live page; publishing revalidates the cached public page on demand.
  await page.getByLabel(/^Title/).fill(`${title} revised`);
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/^Published\. The site updates/)).toBeVisible();
  await expect(async () => {
    await pub.reload();
    await expect(pub.getByRole('heading', { level: 1 })).toHaveText(`${title} revised`, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });

  // History lists the versions.
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText(/^Version \d+, published/).first()).toBeVisible();

  // Archive takes it down.
  await page.getByRole('tab', { name: 'Publishing' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();
  await expect(async () => {
    expect((await page.request.get(`${WEB}/${slug}`)).status()).toBe(404);
  }).toPass({ timeout: 20_000 });
});

test('validation errors are shown on the fields', async ({ page }) => {
  await page.goto(`${ADMIN}/cms/projects/new`);
  await page.getByLabel(/^Title/).fill(`Unfinished project ${randomUUID().slice(0, 6)}`);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText('Some fields need attention')).toBeVisible();
  await expect(page.getByLabel(/^Summary for cards/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(`${ADMIN}/cms/projects/new`);
});

test('media library: upload, describe and delete an image', async ({ page }) => {
  await page.goto(`${ADMIN}/media`);
  await page.waitForLoadState('networkidle'); // the drop zone listens only once hydrated
  const name = `e2e-lawn-${randomUUID().slice(0, 6)}`;
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('1 image added to the library')).toBeVisible();

  const alt = page.getByLabel('Alt text').first();
  await expect(alt).toHaveValue(name.replace(/-/g, ' '));
  await alt.fill(`Freshly laid carabao grass ${name}`);
  await alt.press('Enter');
  await expect(page.getByText('Alt text saved')).toBeVisible();

  await page.reload();
  const tile = page.getByRole('listitem').filter({ has: page.locator(`input[value="Freshly laid carabao grass ${name}"]`) });
  await tile.getByRole('button', { name: 'Delete' }).click();
  await expect(tile).toHaveCount(0);
});

test('a file that is not really an image is refused', async ({ page }) => {
  await page.goto(`${ADMIN}/media`);
  await page.waitForLoadState('networkidle'); // the drop zone listens only once hydrated; a file set earlier is dropped
  await page.getByTestId('dropzone').locator('input[type=file]').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('definitely not a png') });
  await expect(page.getByText(/^fake\.png: /)).toBeVisible();
});
