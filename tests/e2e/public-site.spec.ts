import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createPrismaClient } from '@greenscape/database';
import { ADMIN, PASSWORD, WEB, apiToken, completeMfa, confirmedUser, email, signIn, signedInCustomer } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const NOT_YET = /^\/(shop|cart)(\?|$)/; // Phase 8
const STORY = '/stories/a-new-digital-home-greenscape-unveils-official-website';
const PROJECT = '/projects/sustainable-landscaping-in-action';

test.describe('content pages', () => {
  test('home shows CMS services, projects and business data', async ({ page }) => {
    await page.goto(WEB);
    await expect(page.getByRole('heading', { name: 'Four ways we look after a garden' })).toBeVisible();
    for (const s of ['Garden Design', 'Landscaping', 'Garden Maintenance', 'Garden Essentials']) await expect(page.getByRole('link', { name: s, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gardens we have built' })).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    expect(ld).toMatchObject({ '@type': 'LandscapingBusiness', telephone: '0917 844 3330' });
  });

  test('every internal link on the main pages resolves', async ({ page, request, isMobile }) => {
    test.skip(isMobile, 'same links on both viewports');
    const seen = new Set<string>();
    for (const path of ['/', '/services', '/projects', '/stories', '/about', '/contact']) {
      await page.goto(`${WEB}${path}`);
      for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
        const u = href.split('#')[0]!;
        if (u && !NOT_YET.test(u)) seen.add(u);
      }
    }
    const bad: string[] = [];
    for (const u of seen) {
      const res = await request.get(`${WEB}${u}`, { maxRedirects: 0 });
      if (res.status() >= 400) bad.push(`${res.status()} ${u}`);
    }
    expect(bad).toEqual([]);
    expect(seen.size).toBeGreaterThan(30);
  });

  test('sitemap lists every published page and each one loads', async ({ request, isMobile }) => {
    test.skip(isMobile, 'server check');
    const xml = await (await request.get(`${WEB}/sitemap.xml`)).text();
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(urls).toEqual(expect.arrayContaining(['/', '/services/garden-maintenance', PROJECT, STORY, '/quote']));
    for (const u of urls) expect((await request.get(`${WEB}${u}`)).status(), u).toBe(200);
    expect(await (await request.get(`${WEB}/robots.txt`)).text()).toContain('Sitemap:');
  });

  test('legacy URLs from the old site redirect permanently', async ({ request, isMobile }) => {
    test.skip(isMobile, 'server check');
    const cases: [string, string][] = [
      ['/index.html', '/'],
      ['/pages/services/garden-essential/', '/services/garden-essentials'],
      ['/pages/services/landscaping/index.html', '/services/landscaping'],
      ['/pages/projects/indoor-landscaping.html', '/projects?category=indoor-landscaping'],
      ['/pages/contact/faq.html', '/faq'],
      ['/pages/get-a-quote/', '/quote'],
      ['/pages/our-story/story.html?id=EyN1Ib5hZeMMq5EOlLxP', STORY],
      ['/share/story?id=EyN1Ib5hZeMMq5EOlLxP', STORY],
      ['/pages/our-story/story.html?id=doesnotexist1', '/stories'],
    ];
    // Next first normalises a trailing slash (308), then our map answers 301: every hop must be permanent.
    for (const [from, to] of cases) {
      let url = from;
      for (let hop = 0; hop < 3; hop++) {
        const res = await request.get(`${WEB}${url}`, { maxRedirects: 0 });
        if (res.status() < 300 || res.status() >= 400) break;
        expect([301, 308], `${from} hop ${hop}`).toContain(res.status());
        const loc = new URL(res.headers().location!, WEB);
        url = loc.pathname + loc.search;
      }
      expect(url, from).toBe(to);
    }
  });

  test('project photos open in a keyboard-friendly viewer', async ({ page }) => {
    await page.goto(`${WEB}${PROJECT}`);
    const first = page.getByRole('list', { name: /Photos of/ }).getByRole('button').first();
    await first.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText(/^2 \/ \d+$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
  });

  test('before/after comparison works from the keyboard', async ({ page }) => {
    await page.goto(`${WEB}/services/garden-design`);
    const slider = page.getByRole('slider').first();
    await expect(slider).toHaveAttribute('aria-valuetext', '50% before');
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuetext', '49% before');
  });

  test('maintenance packages show their published prices', async ({ page }) => {
    await page.goto(`${WEB}/services/garden-maintenance`);
    for (const price of ['₱5,250', '₱8,850', '₱16,820']) await expect(page.getByText(price)).toBeVisible();
  });
});

test.describe('quote request', () => {
  test('guests are asked to sign in before the second step', async ({ page }) => {
    await page.goto(`${WEB}/quote`);
    await page.getByRole('main').locator('form').locator('label', { hasText: /^Landscaping$/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('sign-in-prompt')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  });

  test('three steps with validation, an attachment, a reference number and a confirmation email', async ({ page }) => {
    const e = email('quote');
    await signedInCustomer(page, 'quoter');
    await page.goto(`${WEB}/quote`);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choose at least one service' })).toBeVisible();

    // The inputs are visually hidden inside choice cards; click the visible card like a person would.
    await page.getByRole('main').locator('form').locator('label', { hasText: /^Landscaping$/ }).click();
    await expect(page.getByRole('checkbox', { name: 'Landscaping', exact: true })).toBeChecked();
    await page.getByRole('main').locator('form').locator('label', { hasText: /^Garden maintenance$/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'About the property' })).toBeFocused();

    await page.getByRole('main').locator('form').locator('label', { hasText: /^Home$/ }).click();
    await expect(page.getByRole('radio', { name: 'Home', exact: true })).toBeChecked();
    await page.getByLabel('Location').fill('San Jose, Puerto Princesa');
    await page.getByLabel('About the project').fill('Front garden needs new planting and a drip line along the fence.');
    await page.locator('input[type=file]').setInputFiles({ name: 'garden.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('Uploaded')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Full name').fill('Juan Dela Cruz');
    await page.getByLabel('Mobile or phone').fill('0917 844 3330');
    await page.getByLabel('Email').fill(e);
    await page.getByRole('checkbox', { name: /I agree/ }).check();
    await page.getByRole('button', { name: 'Send request' }).click();

    const number = page.getByTestId('quote-number');
    await expect(number).toHaveText(/^Q-\d{4}-\d{6}$/);
    const ref = (await number.textContent())!;
    const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
    await expect
      .poll(async () => {
        const r = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${e}"`)}`).then((x) => x.json());
        return (r.messages ?? []).map((m: { Subject: string }) => m.Subject);
      }, { timeout: 15_000 })
      .toContain(`We received your quote request (${ref})`);
  });

  test('staff see the request in the admin inbox and can change its status', async ({ page }) => {
    // Submit a request through the API as a customer, then sign in as a staff member created with the role up front.
    const customer = await confirmedUser('resort');
    const ref = await (await fetch('http://localhost:4000/v1/quotations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await apiToken(customer.email)}` },
      body: JSON.stringify({ services: ['garden-design'], propertyType: 'resort', projectLocation: 'El Nido', details: 'Entrance garden refresh for a small resort.', name: 'Ana Reyes', email: email('resort'), phone: '09178443330', consent: true, attachments: [] }),
    }).then((r) => r.json())).number as string;

    const staff = await confirmedUser('inbox');
    const db = createPrismaClient(process.env.DATABASE_URL!);
    const role = await db.role.findUniqueOrThrow({ where: { key: 'ecommerce_manager' } });
    await db.user.create({ data: { authUserId: staff.authUserId, email: staff.email, roles: { create: [{ roleId: role.id }] } } });
    await db.$disconnect();

    await page.goto(`${ADMIN}/login?next=%2Fquotations`);
    await page.getByLabel('Email').fill(staff.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await completeMfa(page, staff.email); // staff MFA, then back to where they were going
    await expect(page).toHaveURL(`${ADMIN}/quotations`);
    await page.getByRole('link', { name: ref }).click();
    await expect(page.getByRole('heading', { name: new RegExp(ref) })).toBeVisible();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('CONTACTED');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('CONTACTED');
  });
});

test('contact form: a guest is asked to sign in, keeps the message, then sends it', async ({ page }) => {
  const u = await confirmedUser('contact');
  await page.goto(`${WEB}/contact`);
  await page.getByLabel('Full name').fill('Maria Santos');
  await page.getByLabel('Email').fill(email('contact'));
  await page.getByRole('textbox', { name: 'Message' }).fill('Do you deliver plants to Roxas?');
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Send message' }).click();
  const prompt = page.getByTestId('sign-in-prompt');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('link', { name: 'Sign in with email' }).click();
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fcontact%3Fintent%3Dcontact$/);
  await expect(prompt).toBeHidden();
  await signIn(page, u.email);
  await expect(page).toHaveURL(/\/contact\?intent=contact$/, { timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Do you deliver plants to Roxas?');
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Your message reached the team');
});

test.describe('accessibility of content pages (axe, WCAG 2.1 AA)', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const path of ['/', '/about', '/services', '/services/garden-maintenance', '/services/garden-design', '/projects', PROJECT, '/stories', STORY, '/gallery', '/testimonials', '/faq', '/contact', '/quote', '/privacy']) {
    test(`no serious or critical violations: ${path}`, async ({ page }) => {
      await page.goto(`${WEB}${path}`);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`)).toEqual([]);
    });
  }
});
