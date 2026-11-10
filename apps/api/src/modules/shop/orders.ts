// Order state machine. Stock rules:
//   checkout  → reserved += q  (conditional UPDATE: only if onHand - reserved >= q, so stock can't be oversold)
//   paid      → onHand -= q, reserved -= q   (SALE)
//   failed / cancelled / expired → reserved -= q   (RELEASE)
//   refund with restock → onHand += q   (RETURN)
// Payment events arrive through applyPaymentEvent only; the WebhookEvent insert makes replays no-ops.
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@greenscape/database';
import { FULFILLMENT_LABELS, type CheckoutForm, type FulfillmentStatus } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { notifyTo } from '../../lib/notify.ts';
import { AppError } from '../../lib/errors.ts';
import { emailHtml, emailText } from '../../lib/mailer.ts';
import type { NormalizedPaymentEvent } from './payments.ts';

type Tx = Prisma.TransactionClient;
type DecVal = Prisma.Decimal | string | number;
const D = (v: DecVal) => new Prisma.Decimal(v);
export const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000000';
export const money = (v: DecVal) => D(v).toFixed(2);
export const peso = (v: DecVal) => `₱${Number(D(v).toFixed(2)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');
const yearOf = () => new Date(Date.now() + 8 * 3600_000).getUTCFullYear(); // Manila year

interface Line { variantId: string; quantity: number }

/** Reserve stock for every tracked line, or throw 409 OUT_OF_STOCK listing what is short. Lines are sorted to avoid deadlocks. */
async function reserve(tx: Tx, lines: Line[], orderId: string) {
  const short: { variantId: string; available: number }[] = [];
  for (const l of [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const n = await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = "reserved" + ${l.quantity}, "version" = "version" + 1, "updatedAt" = now()
      WHERE "variantId" = ${l.variantId}::uuid AND "onHand" - "reserved" >= ${l.quantity}`;
    if (n === 1) {
      await tx.stockMovement.create({ data: { variantId: l.variantId, type: 'RESERVE', quantity: l.quantity, orderId } });
      continue;
    }
    const lvl = await tx.inventoryLevel.findUnique({ where: { variantId: l.variantId } });
    short.push({ variantId: l.variantId, available: lvl ? Math.max(0, lvl.onHand - lvl.reserved) : 0 });
  }
  if (short.length) throw new AppError(409, 'OUT_OF_STOCK', 'Some items are no longer available in the quantity you chose.', short);
}

async function release(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: { select: { trackInventory: true } } } });
  for (const i of items.filter((x) => x.variant.trackInventory).sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    await tx.$executeRaw`UPDATE "InventoryLevel" SET "reserved" = "reserved" - ${i.quantity}, "version" = "version" + 1, "updatedAt" = now() WHERE "variantId" = ${i.variantId}::uuid`;
    await tx.stockMovement.create({ data: { variantId: i.variantId, type: 'RELEASE', quantity: -i.quantity, orderId } });
  }
}

/** Reserved → sold. Returns the variants whose available stock is now at or below their low-stock level. */
async function commitSale(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: { select: { trackInventory: true } } } });
  const low: string[] = [];
  for (const i of items.filter((x) => x.variant.trackInventory).sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    await tx.$executeRaw`UPDATE "InventoryLevel" SET "onHand" = "onHand" - ${i.quantity}, "reserved" = "reserved" - ${i.quantity}, "version" = "version" + 1, "updatedAt" = now() WHERE "variantId" = ${i.variantId}::uuid`;
    await tx.stockMovement.create({ data: { variantId: i.variantId, type: 'SALE', quantity: -i.quantity, orderId } });
    const lvl = await tx.inventoryLevel.findUnique({ where: { variantId: i.variantId } });
    if (lvl && lvl.onHand - lvl.reserved <= lvl.lowStockAt) low.push(i.variantId);
  }
  return low;
}

/** A payment that succeeded after its order was cancelled (reservation expired): take the stock again if it is still there. */
async function retakeForLatePayment(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: { select: { trackInventory: true } } } });
  for (const i of items.filter((x) => x.variant.trackInventory).sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const n = await tx.$executeRaw`UPDATE "InventoryLevel" SET "onHand" = "onHand" - ${i.quantity}, "version" = "version" + 1, "updatedAt" = now()
      WHERE "variantId" = ${i.variantId}::uuid AND "onHand" - "reserved" >= ${i.quantity}`;
    if (n !== 1) throw new LateStockError();
    await tx.stockMovement.create({ data: { variantId: i.variantId, type: 'SALE', quantity: -i.quantity, orderId, reason: 'payment after reservation expired' } });
  }
}
class LateStockError extends Error {}

// ── checkout ──
export interface PlacedOrder { number: string; redirectUrl: string; accessKey: string | null; isTest: boolean }

export async function placeOrder(
  deps: Deps,
  input: { form: CheckoutForm; idempotencyKey: string; cartId: string; userId?: string; userEmail?: string },
): Promise<PlacedOrder> {
  const { db, payments, env, log } = deps;

  const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  if (existing) return replay(existing);

  const cart = await db.cart.findUnique({ where: { id: input.cartId }, include: { items: { include: { variant: { include: { product: true } } } } } });
  if (!cart || cart.status !== 'OPEN' || !cart.items.length) throw new AppError(400, 'CART_EMPTY', 'Your cart is empty.');
  const zone = await db.deliveryZone.findUnique({ where: { id: input.form.zoneId } });
  if (!zone || !zone.isActive || zone.fee === null) throw new AppError(400, 'ZONE_UNAVAILABLE', 'We do not deliver to that municipality yet. Please call us on 0917 844 3330.');

  const unavailable = cart.items.filter((i) => !i.variant.isActive || i.variant.product.status !== 'ACTIVE');
  if (unavailable.length) throw new AppError(409, 'UNAVAILABLE', 'Some items are no longer sold. Remove them to continue.', unavailable.map((i) => ({ variantId: i.variantId })));

  const lines = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: D(i.variant.price), name: `${i.variant.product.name}${i.variant.name && i.variant.name !== 'Default' ? `, ${i.variant.name}` : ''}`, sku: i.variant.sku, tracked: i.variant.trackInventory }));
  const subtotal = lines.reduce((s, l) => s.plus(l.unitPrice.times(l.quantity)), D(0));
  const fee = D(zone.fee);
  const total = subtotal.plus(fee);
  const accessKey = randomBytes(24).toString('base64url');
  const f = input.form;

  let order;
  try {
    order = await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
      const number = `GS-${yearOf()}-${String(row!.n).padStart(6, '0')}`;
      const customer = input.userId
        ? await tx.customer.upsert({ where: { userId: input.userId }, create: { userId: input.userId, email: input.userEmail ?? f.email, name: f.name, phone: f.phone }, update: { phone: f.phone } })
        : (await tx.customer.findFirst({ where: { userId: null, email: { equals: f.email, mode: 'insensitive' } } })) ?? (await tx.customer.create({ data: { email: f.email, name: f.name, phone: f.phone } }));
      const o = await tx.order.create({
        data: {
          number, customerId: customer.id, subtotal, deliveryFee: fee, total, currency: 'PHP', notes: f.notes, idempotencyKey: input.idempotencyKey,
          shippingAddress: { recipient: f.name, phone: f.phone, email: f.email, line1: f.line1, line2: f.line2 ?? null, barangay: f.barangay, city: zone.name, province: zone.province, postalCode: f.postalCode ?? null, zoneId: zone.id },
          reservationExpiresAt: new Date(Date.now() + env.RESERVATION_MINUTES * 60_000),
          accessKeyHash: hashKey(accessKey),
          items: { create: lines.map((l) => ({ variantId: l.variantId, sku: l.sku, name: l.name, unitPrice: l.unitPrice, quantity: l.quantity, lineTotal: l.unitPrice.times(l.quantity) })) },
          events: { create: { type: 'placed', actorId: input.userId ?? null, data: { items: lines.length, total: money(total) } } },
        },
      });
      await reserve(tx, lines.filter((l) => l.tracked), o.id);
      await tx.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED' } });
      return o;
    });
  } catch (err) {
    // Two submits with the same key raced: the loser returns the winner's order.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const o = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
      if (o) return replay(o);
    }
    throw err;
  }

  const back = `${env.WEB_URL}/orders/${order.number}?key=${accessKey}`;
  try {
    const session = await payments.createCheckoutSession(
      { orderId: order.id, number: order.number, email: f.email, currency: 'PHP', lines: lines.map((l) => ({ name: l.name, unitPrice: money(l.unitPrice), quantity: l.quantity })), deliveryFee: money(fee), total: money(total) },
      { success: back, cancel: `${back}&cancelled=1` },
    );
    await db.payment.create({ data: { orderId: order.id, provider: payments.name, providerRef: session.ref, amount: total, currency: 'PHP', isTest: payments.isTest, rawLast: { redirectUrl: session.redirectUrl } } });
    return { number: order.number, redirectUrl: session.redirectUrl, accessKey, isTest: payments.isTest };
  } catch (err) {
    log.error({ err, order: order.number }, 'payment session failed; releasing stock');
    await cancelOrder(deps, order.id, { reason: 'payment provider unavailable', actorId: null });
    throw new AppError(502, 'PAYMENT_UNAVAILABLE', 'We could not start the payment. Nothing was charged; please try again in a moment.');
  }

  function replay(o: { number: string; status: string; payments: { rawLast: unknown }[] }): PlacedOrder {
    const redirectUrl = (o.payments[0]?.rawLast as { redirectUrl?: string } | null)?.redirectUrl;
    // Same submit again: send them back to the same payment page (or the order page once it is settled). No new access key.
    return { number: o.number, redirectUrl: o.status === 'PENDING_PAYMENT' && redirectUrl ? redirectUrl : `${env.WEB_URL}/orders/${o.number}`, accessKey: null, isTest: payments.isTest };
  }
}

// ── payment events ──
export type ApplyResult = 'applied' | 'duplicate' | 'ignored' | 'unknown_payment';

export async function applyPaymentEvent(deps: Deps, event: NormalizedPaymentEvent, raw: unknown): Promise<ApplyResult> {
  const { db, payments, log } = deps;
  const ledgerId = `${payments.name}:${event.id}`;
  try {
    await db.webhookEvent.create({ data: { id: ledgerId, provider: payments.name, type: event.type, payload: raw as Prisma.InputJsonValue } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
    throw err;
  }
  const payment = await db.payment.findUnique({ where: { provider_providerRef: { provider: payments.name, providerRef: event.ref } } });
  if (!payment) {
    await db.webhookEvent.update({ where: { id: ledgerId }, data: { error: 'unknown payment ref', processedAt: new Date() } });
    log.warn({ ref: event.ref }, 'payment event for an unknown payment');
    return 'unknown_payment';
  }

  let outcome: { result: ApplyResult; paid?: boolean; low?: string[]; lateRefund?: boolean; cancelled?: string } = { result: 'ignored' };
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${payment.orderId}::uuid FOR UPDATE`; // one transition at a time per order
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (event.type === 'payment.succeeded') {
      if (p.status === 'SUCCEEDED') return;
      if (order.status === 'PENDING_PAYMENT') {
        const low = await commitSale(tx, order.id);
        await tx.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED', rawLast: raw as Prisma.InputJsonValue } });
        await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', reservationExpiresAt: null, events: { create: { type: 'paid', data: { ref: event.ref } } } } });
        outcome = { result: 'applied', paid: true, low };
      } else if (order.status === 'CANCELLED') {
        await tx.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED', rawLast: raw as Prisma.InputJsonValue } });
        try {
          await tx.$executeRaw`SAVEPOINT late`;
          await retakeForLatePayment(tx, order.id);
          await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', events: { create: { type: 'paid_late', data: { ref: event.ref } } } } });
          outcome = { result: 'applied', paid: true, low: [] };
        } catch (e) {
          if (!(e instanceof LateStockError)) throw e;
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT late`;
          await tx.orderEvent.create({ data: { orderId: order.id, type: 'paid_late_no_stock', data: { ref: event.ref } } });
          outcome = { result: 'applied', lateRefund: true };
        }
      }
    } else if (order.status === 'PENDING_PAYMENT' && p.status === 'PENDING') {
      await release(tx, order.id);
      const failed = event.type === 'payment.failed';
      await tx.payment.update({ where: { id: p.id }, data: { status: failed ? 'FAILED' : 'CANCELLED', rawLast: raw as Prisma.InputJsonValue } });
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', reservationExpiresAt: null, events: { create: { type: failed ? 'payment_failed' : 'payment_cancelled', data: { ref: event.ref } } } } });
      outcome = { result: 'applied', cancelled: failed ? 'the payment failed' : 'the payment was cancelled' };
    }
  });
  await db.webhookEvent.update({ where: { id: ledgerId }, data: { processedAt: new Date() } });

  if (outcome.lateRefund) {
    // Paid after the hold expired and the stock went to someone else: give the money back automatically.
    await refundOrder(deps, payment.orderId, { amount: money(payment.amount), reason: 'Paid after the reservation expired; item sold out', restock: false, actorId: SYSTEM_ACTOR }).catch((err) => log.error({ err, orderId: payment.orderId }, 'automatic refund failed'));
  }
  if (outcome.paid) {
    await notifyPaid(deps, payment.orderId, outcome.low ?? []);
    await deps.events.emit('order.paid', { orderId: payment.orderId, lowVariantIds: outcome.low ?? [] });
  }
  if (outcome.cancelled) await deps.events.emit('order.cancelled', { orderId: payment.orderId, reason: outcome.cancelled });
  return outcome.result;
}

// ── cancellation, expiry, refunds, fulfilment ──
export async function cancelOrder(deps: Pick<Deps, 'db' | 'events'>, orderId: string, opts: { reason: string; actorId: string | null }) {
  const cancelled = await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status !== 'PENDING_PAYMENT') throw AppError.conflict('Only unpaid orders can be cancelled. Refund a paid order instead.');
    await release(tx, orderId);
    await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    return tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', reservationExpiresAt: null, events: { create: { type: 'cancelled', actorId: opts.actorId, data: { reason: opts.reason } } } } });
  });
  await deps.events.emit('order.cancelled', { orderId, reason: opts.reason });
  return cancelled;
}

/** Unpaid orders past their hold: ask the provider once more (a payment may have succeeded without a webhook), else cancel. */
export async function expireReservations(deps: Deps, now = new Date()) {
  const due = await deps.db.order.findMany({ where: { status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: now } }, include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } }, take: 50 });
  let cancelled = 0;
  for (const o of due) {
    const p = o.payments[0];
    const status = p ? await deps.payments.getPaymentStatus(p.providerRef).catch(() => 'PENDING' as const) : 'PENDING';
    if (p && status === 'SUCCEEDED') {
      await applyPaymentEvent(deps, { id: `reconcile:${p.providerRef}`, type: 'payment.succeeded', ref: p.providerRef }, { source: 'reconcile' });
      continue;
    }
    await cancelOrder(deps, o.id, { reason: 'reservation expired', actorId: null }).then(() => cancelled++).catch(() => undefined); // raced with a payment
  }
  return cancelled;
}

export function startShopJobs(deps: Deps, everyMs = 60_000) {
  const tick = async () => {
    const got = await deps.redis.set(`${deps.env.CACHE_PREFIX}:lock:shop-expiry`, '1', 'PX', everyMs - 1000, 'NX').catch(() => 'OK');
    if (!got) return;
    const n = await expireReservations(deps);
    if (n) deps.log.info({ cancelled: n }, 'expired order reservations released');
  };
  const timer = setInterval(() => void tick().catch((err) => deps.log.error({ err }, 'shop jobs tick failed')), everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}

export async function refundOrder(deps: Deps, orderId: string, opts: { amount: string; reason: string; restock: boolean; actorId: string }) {
  const { db, payments } = deps;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, include: { refunds: true } } } });
  const p = order.payments[0];
  if (!p) throw AppError.conflict('This order has no successful payment to refund.');
  const refunded = p.refunds.filter((r) => r.status !== 'failed').reduce((s, r) => s.plus(r.amount), D(0));
  const amount = D(opts.amount);
  const left = D(p.amount).minus(refunded);
  if (amount.lte(0) || amount.gt(left)) throw AppError.badRequest(`Refund between ₱0.01 and ${peso(left)}.`);
  const full = amount.eq(left);
  if (opts.restock && !full) throw AppError.badRequest('Stock can only be returned with a full refund. Adjust stock separately for partial returns.');
  if (opts.restock && order.fulfillment === 'RETURNED') throw AppError.conflict('Stock for this order was already returned.');

  const r = await payments.refundPayment(p.providerRef, money(amount), opts.reason);
  await db.$transaction(async (tx) => {
    await tx.refund.create({ data: { paymentId: p.id, providerRef: r.refundRef, amount, reason: opts.reason, status: r.status, actorId: opts.actorId } });
    await tx.payment.update({ where: { id: p.id }, data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    if (opts.restock) {
      const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: { select: { trackInventory: true } } } });
      for (const i of items.filter((x) => x.variant.trackInventory)) {
        await tx.inventoryLevel.upsert({ where: { variantId: i.variantId }, create: { variantId: i.variantId, onHand: i.quantity }, update: { onHand: { increment: i.quantity }, version: { increment: 1 } } });
        await tx.stockMovement.create({ data: { variantId: i.variantId, type: 'RETURN', quantity: i.quantity, orderId, actorId: opts.actorId, reason: 'refund' } });
      }
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED', ...(opts.restock ? { fulfillment: 'RETURNED' } : {}), events: { create: { type: 'refunded', actorId: opts.actorId, data: { amount: money(amount), reason: opts.reason, restock: opts.restock, refundRef: r.refundRef } } } },
    });
  });
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
  const email = (o.shippingAddress as { email?: string }).email ?? o.customer.email;
  await deps.mailer.send({
    to: email,
    subject: `Refund for order ${o.number}`,
    text: emailText('Your refund is on its way', [`We refunded ${peso(amount)} for order ${o.number}.`, 'It can take 5 to 10 banking days to appear, depending on your bank or card.'], [['Order', o.number], ['Refund', peso(amount)]]),
    html: emailHtml('Your refund is on its way', [`We refunded ${peso(amount)} for order ${o.number}.`, 'It can take 5 to 10 banking days to appear, depending on your bank or card.'], [['Order', o.number], ['Refund', peso(amount)]]),
  });
  await deps.events.emit('order.refunded', { orderId });
  return o;
}

const NEXT: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  UNFULFILLED: ['PREPARING', 'OUT_FOR_DELIVERY'],
  PREPARING: ['OUT_FOR_DELIVERY', 'UNFULFILLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'PREPARING'],
  DELIVERED: [],
  RETURNED: [],
};

export async function setFulfillment(deps: Deps, orderId: string, to: FulfillmentStatus, actorId: string, note?: string) {
  const o = await deps.db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
  if (o.status !== 'PAID') throw AppError.conflict('Only paid orders can be prepared or delivered.');
  if (!NEXT[o.fulfillment].includes(to)) throw AppError.conflict(`An order that is "${FULFILLMENT_LABELS[o.fulfillment]}" cannot become "${FULFILLMENT_LABELS[to]}".`);
  const updated = await deps.db.order.update({
    where: { id: orderId },
    data: { fulfillment: to, ...(to === 'DELIVERED' ? { status: 'COMPLETED' } : {}), events: { create: { type: `fulfillment.${to.toLowerCase()}`, actorId, data: note ? { note } : undefined } } },
  });
  await deps.events.emit('order.fulfillment_changed', { orderId });
  if (to === 'OUT_FOR_DELIVERY' || to === 'DELIVERED') {
    const email = (o.shippingAddress as { email?: string }).email ?? o.customer.email;
    const title = to === 'DELIVERED' ? 'Your order was delivered' : 'Your order is on its way';
    const body = to === 'DELIVERED' ? [`Order ${o.number} was delivered. Thank you for your order.`, 'Questions about caring for your plants? Reply to this email or call 0917 844 3330.'] : [`Order ${o.number} is out for delivery.`, 'Questions? Reply to this email or call 0917 844 3330.'];
    await deps.mailer.send({ to: email, subject: `${title} (${o.number})`, text: emailText(title, body, [['Order', o.number]]), html: emailHtml(title, body, [['Order', o.number]]) });
  }
  return updated;
}

async function notifyPaid(deps: Deps, orderId: string, lowVariantIds: string[]) {
  const { db, mailer, env } = deps;
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, customer: true } });
  const a = o.shippingAddress as { recipient: string; phone: string; email?: string; line1: string; line2?: string | null; barangay: string; city: string; province: string };
  const rows: [string, string][] = [
    ['Order', o.number],
    ...o.items.map((i): [string, string] => [`${i.quantity} × ${i.name}`, peso(i.lineTotal)]),
    ['Delivery', peso(o.deliveryFee)],
    ['Total paid', peso(o.total)],
    ['Deliver to', [a.recipient, a.line1, a.line2, a.barangay, `${a.city}, ${a.province}`].filter(Boolean).join(', ')],
  ];
  const to = a.email ?? o.customer.email;
  const staff = await notifyTo(deps, 'orders');
  await Promise.all([
    mailer.send({
      to,
      subject: `Order confirmed: ${o.number}`,
      text: emailText('Thank you, your order is confirmed', [`Hi ${a.recipient}, we received your payment and are preparing your order.`, 'We will email you again when it is out for delivery.'], rows),
      html: emailHtml('Thank you, your order is confirmed', [`Hi ${a.recipient}, we received your payment and are preparing your order.`, 'We will email you again when it is out for delivery.'], rows),
    }),
    mailer.send({
      to: staff,
      subject: `New paid order ${o.number} (${peso(o.total)})`,
      text: emailText('New paid order', [`${a.recipient}, ${a.phone}`], rows, { label: 'Open in admin', href: `${env.ADMIN_URL}/orders/${o.id}` }),
      html: emailHtml('New paid order', [`${a.recipient}, ${a.phone}`], rows, { label: 'Open in admin', href: `${env.ADMIN_URL}/orders/${o.id}` }),
    }),
  ]);
  if (lowVariantIds.length) {
    const vs = await db.productVariant.findMany({ where: { id: { in: lowVariantIds } }, include: { product: { select: { name: true } }, inventory: true } });
    const lowRows = vs.map((v): [string, string] => [`${v.product.name} (${v.sku})`, `${(v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)} left`]);
    await mailer.send({
      to: await notifyTo(deps, 'stock'),
      subject: `Low stock: ${vs.map((v) => v.sku).join(', ')}`,
      text: emailText('Low stock', ['These items reached their low-stock level after an order.'], lowRows, { label: 'Open inventory', href: `${env.ADMIN_URL}/inventory?low=1` }),
      html: emailHtml('Low stock', ['These items reached their low-stock level after an order.'], lowRows, { label: 'Open inventory', href: `${env.ADMIN_URL}/inventory?low=1` }),
    });
  }
}
