import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { createPrismaClient } from '@greenscape/database';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, WEB, signIn, signedInCustomer, staffUser } from './helpers';

// Fixture products are created straight in Postgres (clearly named, removed afterwards); the old site has no prices,
// so the real catalogue has nothing buyable until staff price it.
const db = createPrismaClient(process.env.DATABASE_URL!);
const tag = `e2e${randomUUID().slice(0, 6)}`;
const created = { products: [] as string[], zones: [] as string[] };

async function fixture(opts: { stock: number; price?: string; legacyId?: string }) {
  const cat = await db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
  const id = randomUUID().slice(0, 6);
  const p = await db.product.create({
    data: {
      slug: `e2e-monstera-${tag}-${id}`, name: `E2E Monstera ${id}`, scientificName: 'Monstera deliciosa', categoryId: cat.id, status: 'ACTIVE', legacyId: opts.legacyId,
      variants: { create: { sku: `E2E-${tag}-${id}`.toUpperCase(), name: 'Default', price: opts.price ?? '450', inventory: { create: { onHand: opts.stock } } } },
    },
    include: { variants: true },
  });
  created.products.push(p.id);
  return { slug: p.slug, name: p.name, variantId: p.variants[0]!.id };
}
const stock = async (variantId: string) => db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });

let zone = '';
test.beforeAll(async () => {
  const z = await db.deliveryZone.create({ data: { name: `E2E Town ${tag}`, fee: '120', isActive: true, sortOrder: -1 } });
  created.zones.push(z.id);
  zone = z.name;
});
test.afterAll(async () => {
  const orders = await db.order.findMany({ where: { items: { some: { variant: { productId: { in: created.products } } } } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  const pays = await db.payment.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
  await db.refund.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.stockMovement.deleteMany({ where: { variant: { productId: { in: created.products } } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.cart.deleteMany({ where: { items: { some: { variant: { productId: { in: created.products } } } } } });
  await db.product.deleteMany({ where: { id: { in: created.products } } });
  await db.deliveryZone.deleteMany({ where: { id: { in: created.zones } } });
  await db.customer.deleteMany({ where: { email: { contains: tag } } });
  await db.$disconnect();
});

async function addToCart(page: Page, slug: string, qty = 1) {
  await page.goto(`${WEB}/shop/${slug}`);
  await expect(page.getByText(/^(In stock\.|Only \d+ left\.)$/)).toBeVisible();
  for (let i = 1; i < qty; i++) await page.getByRole('button', { name: 'One more' }).click();
  await page.getByRole('button', { name: /^Add to cart/ }).click();
  await expect(page.getByText(/added to your cart/)).toBeVisible();
}
async function checkout(page: Page, email: string) {
  await page.goto(`${WEB}/checkout`);
  await expect(page.getByText('Test mode:')).toBeVisible();
  await page.getByLabel('Full name').fill('Juan Dela Cruz');
  await page.getByLabel('Mobile number').fill('0917 844 3330');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Municipality or city').selectOption({ label: `${zone}, Palawan, delivery ₱120` });
  await page.getByLabel('Street, building or sitio').fill('12 Rizal Avenue');
  await page.getByLabel('Barangay').fill('San Pedro');
  await page.getByRole('checkbox', { name: /delivery terms/ }).check();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page).toHaveURL(/\/checkout\/pay\/mock_/);
}

test('a guest is asked to sign in before adding to the cart, and checkout needs an account', async ({ page }) => {
  const p = await fixture({ stock: 3 });
  await page.goto(`${WEB}/shop/${p.slug}`);
  await expect(page.getByText(/^(In stock\.|Only \d+ left\.)$/)).toBeVisible();
  await page.getByRole('button', { name: /^Add to cart/ }).click();
  await expect(page.getByTestId('sign-in-prompt')).toBeVisible();
  await page.goto(`${WEB}/checkout`);
  await expect(page).toHaveURL(/\/auth\/login\?next=%2Fcheckout/);
});

test('a customer buys a plant: product page → cart → checkout → test payment → confirmation', async ({ page }) => {
  const p = await fixture({ stock: 3 });
  await signedInCustomer(page, `buyer-${tag}`);
  await addToCart(page, p.slug);
  await expect(page.getByRole('link', { name: 'Cart, 1 items' })).toBeVisible();

  await page.goto(`${WEB}/cart`);
  await page.getByRole('button', { name: `One more ${p.name}` }).click();
  await expect(page.getByRole('group', { name: `Quantity of ${p.name}` })).toContainText('2');
  await page.getByRole('link', { name: 'Check out' }).click();

  const email = `buyer-${tag}-${randomUUID().slice(0, 4)}@test.greenscape.local`;
  await checkout(page, email);
  await expect(page.getByRole('heading', { name: /Pay for GS-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pay ₱1,020' }).click(); // 2 × ₱450 + ₱120 delivery

  await expect(page.getByTestId('order-heading')).toHaveText('Thank you, your order is confirmed');
  await expect(page.getByTestId('order-status')).toHaveText('Paid');
  expect(await stock(p.variantId)).toMatchObject({ onHand: 1, reserved: 0 });

  // Confirmation email
  const mailpit = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
  await expect.poll(async () => (await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json())).messages?.[0]?.Subject, { timeout: 15_000 }).toMatch(/^Order confirmed: GS-/);
});

test('a declined payment cancels the order and gives the stock back', async ({ page }) => {
  const p = await fixture({ stock: 1 });
  await signedInCustomer(page, `declined-${tag}`);
  await addToCart(page, p.slug);
  await checkout(page, `declined-${tag}@test.greenscape.local`);
  expect(await stock(p.variantId)).toMatchObject({ onHand: 1, reserved: 1 });
  await page.getByRole('button', { name: 'Simulate a declined card' }).click();
  await expect(page.getByText('This order was cancelled and nothing was charged.')).toBeVisible();
  expect(await stock(p.variantId)).toMatchObject({ onHand: 1, reserved: 0 });
});

test('sold-out items cannot be added; unpriced products ask for a price', async ({ page }) => {
  const p = await fixture({ stock: 0 });
  await page.goto(`${WEB}/shop/${p.slug}`);
  await expect(page.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Ask when it is back' })).toBeVisible();

  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'plants' } });
  const unpriced = await db.product.create({ data: { slug: `e2e-unpriced-${tag}`, name: `E2E Unpriced ${tag}`, categoryId: cat.id, status: 'ACTIVE' } });
  created.products.push(unpriced.id);
  await page.goto(`${WEB}/shop/${unpriced.slug}`);
  await expect(page.getByText('Price on request')).toBeVisible();
  await page.getByRole('link', { name: 'Ask for a price' }).click();
  await expect(page.getByLabel('Subject (optional)')).toHaveValue(`Price: E2E Unpriced ${tag}`);
});

test('old product links land on the new pages', async ({ page }) => {
  const legacyId = `E2eLegacy${tag}`.slice(0, 20);
  const p = await fixture({ stock: 1, legacyId });
  await page.goto(`${WEB}/pages/services/products/product-detail?id=${legacyId}`);
  await expect(page).toHaveURL(`${WEB}/shop/${p.slug}`);
  const res = await page.request.get(`${WEB}/pages/services/products/?category=soil`, { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers().location).toMatch(/\/shop\?category=soil$|\/pages\/services\/products\?category=soil$/);
  await page.goto(`${WEB}/pages/services/products/?category=soil`);
  await expect(page).toHaveURL(`${WEB}/shop?category=soil`);
});

test('shop pages pass axe (WCAG 2.1 AA)', async ({ page }) => {
  const p = await fixture({ stock: 2 });
  await signedInCustomer(page, `axe-${tag}`);
  await addToCart(page, p.slug);
  // Search for the fixture so the listing renders without encoding dozens of real photos (CPU-heavy under parallel runs).
  for (const path of [`/shop?q=${tag}`, `/shop/${p.slug}`, '/cart', '/checkout']) {
    await page.goto(`${WEB}${path}`);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
});

test.describe('staff', () => {
  test.skip(({ isMobile }) => isMobile, 'admin flows run on desktop');
  test('fulfil an order: preparing → out for delivery → delivered', async ({ page, browser }) => {
    const p = await fixture({ stock: 2 });
    const shopper = await browser.newPage();
    await signedInCustomer(shopper, `ful-${tag}`);
    await addToCart(shopper, p.slug);
    await checkout(shopper, `ful-${tag}@test.greenscape.local`);
    const number = (await shopper.getByRole('heading', { name: /Pay for GS-/ }).textContent())!.replace('Pay for ', '');
    await shopper.getByRole('button', { name: /^Pay ₱/ }).click();
    await expect(shopper.getByTestId('order-status')).toHaveText('Paid');
    await shopper.close();

    const u = await staffUser('shopstaff', ['ecommerce_manager']);
    await page.goto(`${ADMIN}/login`);
    await signIn(page, u.email);
    await expect(page.getByTestId('staff-identity')).toBeVisible();
    await page.goto(`${ADMIN}/orders?q=${number}`);
    await page.getByRole('link', { name: number }).click();
    await page.getByRole('button', { name: 'Start preparing' }).click();
    await expect(page.getByTestId('order-fulfillment')).toHaveText('Being prepared');
    await page.getByRole('button', { name: 'Mark out for delivery' }).click();
    await expect(page.getByTestId('order-fulfillment')).toHaveText('Out for delivery');
    await page.getByRole('button', { name: 'Mark delivered' }).click();
    await expect(page.getByTestId('order-status')).toHaveText('Completed');
    await expect(page.getByTestId('order-history')).toContainText('Delivered');
  });
});
