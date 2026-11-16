// Documentation screenshots of every route in the three portals (`pnpm docs:capture`). Signs in synthetic
// @e2e.greenscape.local accounts (removed by the global teardown), never a real one. Writes PNGs under
// docs/assets/screenshots/<portal>/<area>/ and a coverage manifest at docs/assets/screenshots/manifest.json.
// While iterating: DOCS_ONLY=admin/orders,customer/home narrows the run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { cleanupEmployees, userWithRoles } from '../fixtures/test-users';
import { ADMIN, EMPLOYEE, WEB, signIn, signedInCustomer, staffUser } from '../helpers';

const ROOT = 'docs/assets/screenshots';
const MANIFEST = `${ROOT}/manifest.json`;
const ONLY = process.env.DOCS_ONLY?.split(',');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type Shot = { portal: string; area: string; name: string; route: string; auth: string; status: number; title: string; files: string[]; note?: string; errorShown?: boolean };
const shots: Shot[] = [];

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_800_000);
test.use({ reducedMotion: 'reduce', viewport: DESKTOP });

test.afterAll(() => saveManifest());

// Real people in the local database (anyone whose address is not a synthetic .local one): their names and addresses
// are blanked out of every picture, and a picture that still shows one is refused.
let PRIVATE: string[] = [];
test.beforeAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  const real = { NOT: { email: { endsWith: '.local' } } };
  const [users, customers] = await Promise.all([
    db.user.findMany({ where: real, select: { email: true, displayName: true } }),
    db.customer.findMany({ where: real, select: { email: true, name: true, phone: true } }),
  ]);
  await db.$disconnect();
  PRIVATE = [...new Set([...users.flatMap((u) => [u.email, u.displayName]), ...customers.flatMap((c) => [c.email, c.name, c.phone])])].filter((v): v is string => !!v && v.trim().length > 2);
});

/** Written after every page, so an interrupted run keeps what it captured; a narrowed run keeps the other entries. */
function saveManifest() {
  let prev: Shot[] = [];
  try { prev = JSON.parse(readFileSync(MANIFEST, 'utf8')).shots; } catch { /* first run */ }
  const key = (s: Shot) => `${s.portal}/${s.area}/${s.name}`;
  const merged = new Map([...prev, ...shots].map((s) => [key(s), s]));
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), shots: [...merged.values()].sort((a, b) => key(a).localeCompare(key(b))) }, null, 2)}\n`);
}

/** Screenshot as a palette PNG (about a third of the size: the docs live in git). */
async function png(page: Page, path: string, fullPage = false) {
  // The dev servers' Next.js badge and issues pill are not part of the product.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  if (fullPage) {
    // Lazy images only load near the viewport: walk down the page, then wait for every image.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      scrollTo(0, 0);
    });
    await settled(page, true);
  }
  const left = await redact(page); // right before the picture: client-rendered lists fill in after load
  if (left.length) throw new Error(`refusing to save ${path}: ${left.length} private value(s) still visible`);
  const buf = await page.screenshot({ fullPage, animations: 'disabled' });
  await sharp(buf).png({ palette: true, quality: 90, effort: 8 }).toFile(path);
}

function record(s: Shot) {
  shots.push(s);
  saveManifest();
  console.log(`${s.status} ${s.portal}${s.route} -> ${s.files.length} file(s)`);
}

/**
 * Hides real people right before a picture: every non-synthetic email address, and the names, addresses and phone
 * numbers of the accounts in PRIVATE. Returns what is still visible afterwards (should be nothing).
 */
async function redact(page: Page): Promise<string[]> {
  return page.evaluate((priv) => {
    const safe = /@([\w-]+\.)*(local|example\.com)$/i;
    const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const named = priv.length ? new RegExp(priv.map(esc).join('|'), 'gi') : null;
    const clean = (t: string) => {
      const out = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => (safe.test(m) ? m : 'redacted@example.com'));
      return named ? out.replace(named, (m) => (m.includes('@') ? 'redacted@example.com' : 'Private Person')) : out;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { const c = clean(n.textContent!); if (c !== n.textContent) n.textContent = c; }
    for (const el of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))) { const c = clean(el.value); if (c !== el.value) el.value = c; }
    const text = (document.body.innerText + ' ' + Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea')).map((e) => e.value).join(' ')).toLowerCase();
    return priv.filter((v) => text.includes(v.toLowerCase()));
  }, PRIVATE);
}

/** React has hydrated, or 20 s passed (a dev server compiling a route; the picture is still taken). */
async function ready(page: Page) {
  await page.waitForFunction(() => Object.keys(document).some((k) => k.startsWith('_reactListening')), null, { timeout: 20_000 }).catch(() => console.log(`[not hydrated] ${page.url()}`));
}

/** Fonts and images in view have loaded; no fixed waits that would hide a slow page. */
async function settled(page: Page, all = false) {
  await page.evaluate(async (all) => {
    const cap = new Promise((r) => setTimeout(r, 15_000)); // a broken image must not stall the run
    await Promise.race([cap, (async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((i) => all || i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    })()]);
  }, all);
  await page.locator('[data-skeleton], [aria-busy=true]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

interface Opts { full?: boolean; mobile?: boolean; auth: string; note?: string; expectStatus?: number }

/** Captures a route; returns false when the page rendered its error boundary instead of content (a 200 can still fail). */
async function shoot(page: Page, base: string, portal: string, area: string, name: string, route: string, o: Opts & { skipIfError?: boolean }): Promise<boolean> {
  if (ONLY && !ONLY.some((f) => `${portal}/${area}`.startsWith(f))) return true;
  const dir = `${ROOT}/${portal}/${area}`;
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  await page.setViewportSize(DESKTOP);
  const res = await page.goto(`${base}${route}`);
  const status = res?.status() ?? 0;
  await ready(page);
  await settled(page);
  const title = PRIVATE.reduce((t, v) => t.split(v).join('Private Person'), await page.title());
  const errorShown = (await page.getByText(/didn.t grow as expected/i).count()) > 0;
  if (errorShown) console.log(`[error page] ${portal}${route}`);
  if (errorShown && o.skipIfError) return false;
  const take = async (suffix: string, full = false) => {
    const path = `${dir}/${name}-${suffix}.png`;
    await png(page, path, full);
    files.push(path);
  };
  await take('desktop');
  if (o.full) await take('fullpage', true);
  if (o.mobile !== false) {
    await page.setViewportSize(MOBILE);
    await settled(page);
    await take('mobile');
    await page.setViewportSize(DESKTOP);
  }
  record({ portal, area, name, route, auth: o.auth, status, title, files, note: o.note, ...(errorShown ? { errorShown } : {}) });
  if (o.expectStatus && status !== o.expectStatus) console.log(`[status] ${portal}${route}: ${status}, expected ${o.expectStatus}`);
  return !errorShown;
}

/** Links on `listRoute` whose path starts with `prefix` and goes one level deeper (detail pages), first five. */
async function details(page: Page, base: string, listRoute: string, prefix: string, exclude: string[] = []) {
  await page.goto(`${base}${listRoute}`);
  await ready(page);
  const hrefs = await page.locator(`a[href^="${prefix}"]`).evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
  return [...new Set(hrefs.filter((h) => h.length > prefix.length && !exclude.some((x) => h.startsWith(x))))].slice(0, 5);
}
const firstDetail = async (...a: Parameters<typeof details>) => (await details(...a))[0];

test('customer website', async ({ page }) => {
  const pub = { auth: 'public', full: true };
  const S = (area: string, name: string, route: string, o: Opts = pub) => shoot(page, WEB, 'customer', area, name, route, o);
  await S('home', 'home', '/');
  await page.setViewportSize({ width: 768, height: 1024 });
  if (!ONLY || ONLY.some((f) => 'customer/home'.startsWith(f))) {
    await page.goto(WEB);
    await settled(page);
    await png(page, `${ROOT}/customer/home/home-tablet.png`);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(WEB);
    await settled(page);
    await png(page, `${ROOT}/customer/home/home-fullhd.png`);
    record({ portal: 'customer', area: 'home', name: 'home-sizes', route: '/', auth: 'public', status: 200, title: await page.title(), files: [`${ROOT}/customer/home/home-tablet.png`, `${ROOT}/customer/home/home-fullhd.png`], note: 'Tablet 768×1024 and Full HD 1920×1080' });
  }
  await page.setViewportSize(DESKTOP);
  await S('about', 'about', '/about');
  await S('services', 'services', '/services');
  const service = await firstDetail(page, WEB, '/services', '/services/');
  if (service) await S('services', 'service-detail', service);
  await S('projects', 'projects', '/projects');
  const project = await firstDetail(page, WEB, '/projects', '/projects/');
  if (project) await S('projects', 'project-detail', project);
  await S('gallery', 'gallery', '/gallery');
  if (!ONLY || ONLY.some((f) => 'customer/gallery'.startsWith(f))) {
    // The image viewer: open the first tile.
    await page.goto(`${WEB}/gallery`);
    await ready(page);
    const tile = page.locator('button[data-lightbox-index]').first();
    if (await tile.count()) {
      await tile.click();
      const dialog = page.getByRole('dialog');
      // The viewer is loaded on first use (a dev server compiles it then).
      if (await dialog.waitFor({ timeout: 20_000 }).then(() => true, () => false)) {
        await settled(page);
        await png(page, `${ROOT}/customer/gallery/gallery-lightbox-desktop.png`);
        record({ portal: 'customer', area: 'gallery', name: 'gallery-lightbox', route: '/gallery', auth: 'public', status: 200, title: await page.title(), files: [`${ROOT}/customer/gallery/gallery-lightbox-desktop.png`] });
      }
    }
  }
  await S('stories', 'stories', '/stories');
  const story = await firstDetail(page, WEB, '/stories', '/stories/');
  if (story) await S('stories', 'story-detail', story);
  await S('testimonials', 'testimonials', '/testimonials');
  await S('faq', 'faq', '/faq');
  await S('contact', 'contact', '/contact');
  await S('quote', 'quote', '/quote');
  await S('legal', 'delivery-policy', '/delivery-policy');
  await S('legal', 'privacy', '/privacy');
  await S('shop', 'shop', '/shop');
  // The imported catalogue has no prices yet ("Price on request"), so a real product shows that state, and a temporary
  // demo product (a real product's photo, a price, stock, one delivery area) shows buying. Removed in the finally below.
  const db = createPrismaClient(process.env.DATABASE_URL!);
  const real = await db.product.findFirst({ where: { status: 'ACTIVE', NOT: { name: { startsWith: 'E2E' } }, images: { some: {} }, category: { slug: 'plants' } }, select: { slug: true, name: true, categoryId: true, scientificName: true, images: { take: 1, select: { mediaId: true, alt: true } } }, orderBy: [{ isFeatured: 'desc' }, { name: 'asc' }] });
  if (real) await S('shop', 'product-price-on-request', `/shop/${real.slug}`, { auth: 'public', note: 'Imported product without a priced size' });
  const tag = randomUUID().slice(0, 6);
  const demo = real && await db.product.create({
    data: {
      slug: `docs-demo-${tag}`, name: real.name, scientificName: real.scientificName, categoryId: real.categoryId, status: 'ACTIVE',
      images: { create: real.images.map((i) => ({ mediaId: i.mediaId, alt: i.alt })) },
      variants: { create: { sku: `DOCS-${tag}`.toUpperCase(), name: 'Medium', price: '450', inventory: { create: { onHand: 25 } } } },
    },
    include: { variants: true },
  });
  const zone = await db.deliveryZone.create({ data: { name: 'Demo municipality', fee: '150', isActive: true, sortOrder: -1 } });
  const product = demo ? `/shop/${demo.slug}` : undefined;
  try {
    if (product) await S('shop', 'product-detail', product, { auth: 'public', note: 'Temporary priced demo product' });
    await customerPages(page, S, product);
  } finally {
    if (demo) {
      const v = demo.variants.map((x) => x.id);
      await db.cartItem.deleteMany({ where: { variantId: { in: v } } });
      await db.wishlistItem.deleteMany({ where: { productId: demo.id } });
      await db.stockMovement.deleteMany({ where: { variantId: { in: v } } });
      await db.inventoryLevel.deleteMany({ where: { variantId: { in: v } } });
      await db.productVariant.deleteMany({ where: { id: { in: v } } });
      await db.product.delete({ where: { id: demo.id } });
    }
    await db.deliveryZone.delete({ where: { id: zone.id } });
    await db.$disconnect();
  }
});

async function customerPages(page: Page, S: (area: string, name: string, route: string, o?: Opts) => Promise<boolean>, product: string | undefined) {
  await S('design', 'design-system', '/design', { auth: 'public', full: true, mobile: false, note: 'Internal design-system gallery' });
  await S('auth', 'login', '/auth/login', { auth: 'public' });
  await S('auth', 'register', '/auth/register', { auth: 'public' });
  await S('auth', 'forgot-password', '/auth/forgot-password', { auth: 'public' });
  await S('errors', 'not-found', '/this-page-does-not-exist', { auth: 'public', expectStatus: 404 });

  // Signed-in customer: add a product so the cart and checkout have something in them.
  await page.goto(`${WEB}/account`); // dev servers compile a route on first request: do it before the sign-in clock runs
  try {
    await signedInCustomer(page, 'docs-customer');
  } catch {
    // shortcut: the first /account load after sign-in sometimes answers 500 "Access token invalid" on the dev stack
    // (a reload works); retry here, and fix the root cause in the app, not in this script.
    for (let i = 0; i < 3 && !(await page.goto(`${WEB}/account`))?.ok(); i++) await page.waitForTimeout(2_000);
    await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  }
  const signed = { auth: 'customer' };
  await S('account', 'account', '/account', signed);
  await S('account', 'notifications', '/account/notifications', signed);
  await S('account', 'messages', '/messages', signed);
  await S('cart', 'cart-empty', '/cart', { ...signed, note: 'Empty state' });
  if (product) {
    await page.goto(`${WEB}${product}`);
    await ready(page);
    const add = page.getByRole('button', { name: /add to cart/i }).first();
    if (await add.waitFor({ timeout: 20_000 }).then(() => add.isEnabled(), () => false)) {
      await add.click();
      await page.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15_000 }).catch(() => {}); // the add-to-cart server action
    } else console.log(`[cart] no Add to cart button on ${product}`);
  }
  await S('cart', 'cart', '/cart', signed);
  await S('checkout', 'checkout', '/checkout', { ...signed, full: true });
}

test('employee portal', async ({ page }) => {
  const S = (area: string, name: string, route: string, o: Opts = { auth: 'employee' }) => shoot(page, EMPLOYEE, 'employee', area, name, route, o);
  await S('login', 'login', '/login', { auth: 'public' });

  // A linked employee on a split-shift schedule, every weekday, like the attendance suite's.
  const db = createPrismaClient(process.env.DATABASE_URL!);
  const tag = `Docs ${randomUUID().slice(0, 6)}`;
  const u = await staffUser('docs-employee', ['employee']);
  const user = await db.user.findUniqueOrThrow({ where: { email: u.email } });
  const sched = await db.workSchedule.create({ data: { name: `Docs crew ${tag}`, graceMinutes: 10, shifts: { create: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '12:00' }, { weekday, startTime: '13:00', endTime: '17:00' }]) } } });
  await db.employee.create({ data: { employeeNo: `DOC-${randomUUID().slice(0, 6).toUpperCase()}`, firstName: 'Ramon', lastName: `Reyes ${tag}`, email: u.email, userId: user.id, scheduleAssignments: { create: { scheduleId: sched.id, effectiveFrom: new Date(Date.now() - 60 * 86_400_000) } } } });
  try {
    await page.goto(`${EMPLOYEE}/login`);
    await signIn(page, u.email);
    await page.waitForURL(`${EMPLOYEE}/`);
    await S('dashboard', 'dashboard-before-clock-in', '/');
    if (!ONLY || ONLY.some((f) => 'employee/dashboard'.startsWith(f))) {
      await page.getByRole('button', { name: 'Clock in' }).click();
      await expect(page.getByTestId('clock-status')).toContainText('Clocked in since');
    }
    await S('dashboard', 'dashboard-clocked-in', '/');
    await S('attendance', 'attendance', '/attendance', { auth: 'employee', full: true });
    await S('schedule', 'schedule', '/schedule');
    await S('requests', 'requests', '/requests', { auth: 'employee', full: true });
    await S('notifications', 'notifications', '/notifications');
    await S('profile', 'profile', '/profile');
    await S('errors', 'not-found', '/this-page-does-not-exist', { auth: 'employee', expectStatus: 404 });
  } finally {
    await cleanupEmployees(tag);
    await db.workSchedule.delete({ where: { id: sched.id } });
    await db.$disconnect();
  }
});

test('admin portal', async ({ page }) => {
  const S = (area: string, name: string, route: string, o: Opts = { auth: 'super_admin' }) => shoot(page, ADMIN, 'admin', area, name, route, o);
  await S('login', 'login', '/login', { auth: 'public' });
  const u = await userWithRoles('docs-admin', ['super_admin']);
  await page.goto(`${ADMIN}/login`);
  await signIn(page, u.email); // enrols the authenticator step on first sign-in
  await expect(page.getByTestId('staff-identity')).toBeAttached({ timeout: 30_000 });

  const pages: [area: string, name: string, route: string][] = [
    ['dashboard', 'dashboard', '/'],
    ['analytics', 'analytics', '/analytics'],
    ['notifications', 'notifications', '/notifications'],
    ['orders', 'orders', '/orders'],
    ['products', 'products', '/products'],
    ['products', 'product-new', '/products/new'],
    ['inventory', 'inventory', '/inventory'],
    ['customers', 'customers', '/customers'],
    ['quotations', 'quotations', '/quotations'],
    ['messages', 'messages', '/messages'],
    ['messages', 'contact-inquiries', '/messages/contact'],
    ['reports', 'sales-report', '/reports/sales'],
    ['cms', 'cms-home', '/cms'],
    ['cms', 'pages', '/cms/pages'],
    ['cms', 'services', '/cms/services'],
    ['cms', 'projects', '/cms/projects'],
    ['cms', 'articles', '/cms/articles'],
    ['cms', 'gallery', '/cms/gallery'],
    ['cms', 'testimonials', '/cms/testimonials'],
    ['cms', 'faqs', '/cms/faqs'],
    ['cms', 'site-settings', '/cms/site'],
    ['employees', 'employees', '/employees'],
    ['employees', 'employee-new', '/employees/new'],
    ['employees', 'schedules', '/employees/schedules'],
    ['attendance', 'attendance', '/attendance'],
    ['attendance', 'corrections', '/attendance/corrections'],
    ['leave', 'leave', '/leave'],
    ['leave', 'balances', '/leave/balances'],
    ['leave', 'settings', '/leave/settings'],
    ['reports', 'attendance-report', '/reports/attendance'],
    ['users', 'users', '/users'],
    ['users', 'roles', '/users/roles'],
    ['system', 'system', '/system'],
    ['settings', 'settings', '/settings'],
    ['settings', 'delivery-zones', '/settings/delivery'],
    ['audit', 'audit', '/audit'],
    ['assistant', 'assistant-settings', '/assistant'],
    ['assistant', 'assistant-knowledge', '/assistant/knowledge'],
    ['assistant', 'assistant-conversations', '/assistant/conversations'],
  ];
  for (const [area, name, route] of pages) await S(area, name, route);

  // Detail pages: the first record each list links to (synthetic seed/test data).
  const detailPages: [area: string, name: string, list: string, prefix: string, exclude?: string[]][] = [
    ['orders', 'order-detail', '/orders', '/orders/'],
    ['products', 'product-edit', '/products', '/products/', ['/products/new', '/products/export']],
    ['customers', 'customer-detail', '/customers', '/customers/'],
    ['quotations', 'quotation-detail', '/quotations', '/quotations/'],
    ['messages', 'message-thread', '/messages', '/messages/', ['/messages/contact']],
    ['cms', 'service-editor', '/cms/services', '/cms/services/', ['/cms/services/new']],
    ['employees', 'employee-detail', '/employees', '/employees/', ['/employees/new', '/employees/schedules']],
    ['attendance', 'employee-days', '/attendance', '/attendance/employee/'],
    ['users', 'role-editor', '/users/roles', '/users/roles/'],
    ['assistant', 'conversation-detail', '/assistant/conversations', '/assistant/conversations/'],
  ];
  for (const [area, name, list, prefix, exclude] of detailPages) {
    if (ONLY && !ONLY.some((f) => `admin/${area}`.startsWith(f))) continue;
    // Skip records whose page shows the error boundary (e.g. old test orders without an address); keep the last try.
    const hrefs = await details(page, ADMIN, list, prefix, exclude);
    for (const [i, href] of hrefs.entries()) if (await shoot(page, ADMIN, 'admin', area, name, href, { auth: 'super_admin', skipIfError: i < hrefs.length - 1 })) break;
    if (!hrefs.length) shots.push({ portal: 'admin', area, name, route: `${prefix}[id]`, auth: 'super_admin', status: 0, title: '', files: [], note: `No record linked from ${list}` });
  }
  await S('cms', 'service-new', '/cms/services/new');
  await S('errors', 'not-found', '/this-page-does-not-exist', { auth: 'super_admin', expectStatus: 404 });
});
