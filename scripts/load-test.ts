// Load test for the catalogue and checkout (Phase 12). Boots the real API (Express + Prisma/Postgres + Redis + Mongo) on a
// random port with the mock payment provider, creates its own product, stock and delivery zone, and cleans them up after.
// Local databases only: it refuses to run against anything that isn't localhost.
//
//   pnpm load:test                         defaults: 20 s catalogue at 50 concurrent, 300 shoppers racing for 40 in stock
//   LOAD_SECONDS=30 LOAD_CONCURRENCY=100 LOAD_SHOPPERS=500 LOAD_STOCK=60 pnpm load:test
//
// Writes docs/performance/load-test.json. Exits non-zero if any request errored (5xx / network) or stock was oversold.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createApp } from '../apps/api/src/app.ts';
import { readEnv } from '../apps/api/src/config/env.ts';
import { closeDeps, createDeps } from '../apps/api/src/lib/deps.ts';
import { createLogger } from '../apps/api/src/lib/logger.ts';

try { process.loadEnvFile(path.resolve(import.meta.dirname, '../.env')); } catch { /* env from the shell */ }

const SECONDS = Number(process.env.LOAD_SECONDS ?? 20);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 50);
const SHOPPERS = Number(process.env.LOAD_SHOPPERS ?? 300);
const STOCK = Number(process.env.LOAD_STOCK ?? 40);

for (const key of ['DATABASE_URL', 'REDIS_URL', 'MONGODB_URL']) {
  const v = process.env[key];
  if (v && !/@?(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(v)) throw new Error(`${key} is not local; the load test only runs against local services.`);
}

const tag = `load${Date.now()}`;
const env = readEnv({
  ...process.env, LOG_LEVEL: 'silent', CACHE_PREFIX: `gs:load:${process.pid}`, PAYMENT_PROVIDER: 'mock', MOCK_PAYMENT_SECRET: 'load-test-mockpay-secret-1234',
  // Measuring the app, not the abuse limits (they're per IP and every virtual user here shares one).
  RATE_LIMIT_PER_MIN: '100000000', FORM_RATE_LIMIT_PER_HOUR: '100000000', REVALIDATE_SECRET: '',
});
const deps = await createDeps(env, createLogger('silent', false));
const server = createApp(deps).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// ── fixtures ──
const category = await deps.db.category.upsert({ where: { slug: 'plants' }, create: { slug: 'plants', name: 'Plants' }, update: {} });
const product = await deps.db.product.create({ data: { slug: `load-fern-${tag}`, name: `Load fern ${tag}`, categoryId: category.id, status: 'ACTIVE', plantType: 'ferns' } });
const variant = await deps.db.productVariant.create({ data: { productId: product.id, sku: `LOAD-${tag}`, name: 'Small pot', price: '250', inventory: { create: { onHand: STOCK } } } });
const zone = await deps.db.deliveryZone.create({ data: { name: `Load zone ${tag}`, fee: '150', isActive: true, sortOrder: 999 } });
const seeded = await deps.db.product.findFirst({ where: { status: 'ACTIVE', id: { not: product.id } }, select: { slug: true } });

// ── measuring ──
type Sample = { ms: number; status: number };
const samples = new Map<string, Sample[]>();
async function hit(name: string, url: string, init?: RequestInit) {
  const t = performance.now();
  let status = 0;
  let body: unknown = null;
  try {
    const res = await fetch(base + url, init);
    status = res.status;
    body = await res.json().catch(() => null);
  } catch { /* network error: status 0 */ }
  (samples.get(name) ?? samples.set(name, []).get(name)!).push({ ms: performance.now() - t, status });
  return { status, body: body as Record<string, unknown> | null };
}
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] ?? 0;
function summary(elapsedS: number) {
  return [...samples].map(([name, s]) => {
    const ms = s.map((x) => x.ms).sort((a, b) => a - b);
    const codes: Record<string, number> = {};
    for (const x of s) codes[x.status] = (codes[x.status] ?? 0) + 1;
    return { name, requests: s.length, rps: Math.round(s.length / elapsedS), p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), p99: Math.round(pct(ms, 99)), max: Math.round(ms.at(-1) ?? 0), codes, errors: s.filter((x) => x.status === 0 || x.status >= 500).length };
  });
}
const json = (body: object, token?: string): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-cart-token': token } : {}) }, body: JSON.stringify(body) });

// ── phase 1: catalogue browsing ──
const browse = [
  ['catalogue list', '/v1/shop/products'],
  ['catalogue category', '/v1/shop/products?category=plants&sort=price-asc'],
  ['catalogue search', `/v1/shop/products?q=${encodeURIComponent('fern')}`],
  ['product detail', `/v1/shop/products/${seeded?.slug ?? product.slug}`],
  ['availability', `/v1/shop/availability?ids=${variant.id}`],
  ['categories', '/v1/shop/categories'],
] as const;
console.log(`catalogue: ${CONCURRENCY} concurrent for ${SECONDS}s against ${base}`);
for (const [name, url] of browse) await hit(`warm ${name}`, url); // fill the caches once, as production would be
samples.clear();
const t1 = performance.now();
const until = t1 + SECONDS * 1000;
await Promise.all(Array.from({ length: CONCURRENCY }, async (_, w) => {
  for (let i = w; performance.now() < until; i++) {
    const [name, url] = browse[i % browse.length]!;
    await hit(name, url);
  }
}));
const catalogue = summary((performance.now() - t1) / 1000);
samples.clear();

// ── phase 2: checkout race — more shoppers than stock, all at once ──
console.log(`checkout: ${SHOPPERS} shoppers, ${CONCURRENCY} at a time, ${STOCK} in stock`);
const form = (i: number) => ({ name: 'Load Tester', email: `shopper-${i}-${tag}@load.greenscape.local`, phone: '0917 844 3330', line1: '12 Rizal Avenue', barangay: 'San Pedro', zoneId: zone.id, consent: true, idempotencyKey: randomUUID() });
let next = 0;
const outcome = { placed: 0, soldOutAtCart: 0, soldOutAtCheckout: 0, duplicateSubmitsMerged: 0, other: [] as string[] };
const t2 = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let i = next++; i < SHOPPERS; i = next++) {
    const add = await hit('cart: add item', '/v1/cart/items', json({ variantId: variant.id, quantity: 1 }));
    if (add.status === 409) { outcome.soldOutAtCart++; continue; }
    if (add.status !== 201) { outcome.other.push(`add ${add.status}`); continue; }
    const token = String(add.body?.cartToken);
    await hit('cart: view', '/v1/cart', { headers: { 'x-cart-token': token } });
    const f = form(i);
    // Every 10th shopper double-clicks "Place order": same idempotency key, sent twice at once.
    const tries = i % 10 === 0 ? 2 : 1;
    const res = await Promise.all(Array.from({ length: tries }, () => hit('checkout', '/v1/checkout', json(f, token))));
    const ok = res.filter((r) => r.status === 201);
    if (ok.length) {
      outcome.placed++;
      if (tries === 2) {
        if (ok.length === 2 && ok[0]!.body?.number === ok[1]!.body?.number) outcome.duplicateSubmitsMerged++;
        else if (ok.length === 2) outcome.other.push('double submit made two orders');
      }
    } else if (res.some((r) => r.status === 409)) outcome.soldOutAtCheckout++;
    else outcome.other.push(`checkout ${res.map((r) => r.status).join('/')}`);
  }
}));
const checkout = summary((performance.now() - t2) / 1000);

// ── invariants, read straight from Postgres ──
const level = await deps.db.inventoryLevel.findUniqueOrThrow({ where: { variantId: variant.id } });
const orders = await deps.db.order.findMany({ where: { items: { some: { variantId: variant.id } } }, select: { id: true, number: true, items: { select: { quantity: true } } } });
const unitsOrdered = orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0);
const invariants = {
  stock: STOCK,
  ordersInDb: orders.length,
  unitsOrdered,
  reserved: level.reserved,
  onHand: level.onHand,
  noOversell: unitsOrdered <= STOCK && level.reserved <= level.onHand,
  reservedMatchesOrders: level.reserved === unitsOrdered,
  apiCountMatchesDb: orders.length === outcome.placed,
};

// ── cleanup (only what this run created) ──
const ids = orders.map((o) => o.id);
const pays = await deps.db.payment.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
await deps.db.payment.deleteMany({ where: { id: { in: pays.map((p) => p.id) } } });
await deps.db.stockMovement.deleteMany({ where: { variantId: variant.id } });
await deps.db.order.deleteMany({ where: { id: { in: ids } } });
await deps.db.cart.deleteMany({ where: { items: { some: { variantId: variant.id } } } });
await deps.db.product.delete({ where: { id: product.id } });
await deps.db.customer.deleteMany({ where: { email: { contains: tag } } });
await deps.db.deliveryZone.delete({ where: { id: zone.id } });
server.close();
await closeDeps(deps);

const report = { ranAt: new Date().toISOString(), config: { seconds: SECONDS, concurrency: CONCURRENCY, shoppers: SHOPPERS, stock: STOCK }, catalogue, checkout, outcome, invariants };
const out = path.resolve(import.meta.dirname, '../docs/performance');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'load-test.json'), JSON.stringify(report, null, 2));
console.table([...catalogue, ...checkout].map(({ codes, ...r }) => ({ ...r, codes: JSON.stringify(codes) })));
console.log(outcome, invariants);
const errors = [...catalogue, ...checkout].reduce((n, r) => n + r.errors, 0);
const ok = errors === 0 && invariants.noOversell && invariants.reservedMatchesOrders && invariants.apiCountMatchesDb && !outcome.other.length;
console.log(ok ? 'PASS' : `FAIL (${errors} errors)`);
process.exit(ok ? 0 : 1);
