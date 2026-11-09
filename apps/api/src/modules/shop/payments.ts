// Payment providers behind one interface (architecture.md §7). The order state machine never talks to a provider
// directly: it receives NormalizedPaymentEvents, so the mock adapter exercises exactly the same path as Stripe.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Redis } from '@greenscape/cache';
import Stripe from 'stripe';

export type ProviderStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export interface NormalizedPaymentEvent { id: string; type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled'; ref: string }
export interface OrderSnapshot {
  orderId: string;
  number: string;
  email: string;
  currency: string;
  lines: { name: string; unitPrice: string; quantity: number }[];
  deliveryFee: string;
  total: string;
}
export interface PaymentProvider {
  readonly name: 'mock' | 'stripe_test';
  readonly isTest: boolean;
  createCheckoutSession(order: OrderSnapshot, urls: { success: string; cancel: string }): Promise<{ ref: string; redirectUrl: string }>;
  /** Verifies the signature; returns null for events we do not act on. Throws on a bad signature. */
  handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<NormalizedPaymentEvent | null>;
  getPaymentStatus(ref: string): Promise<ProviderStatus>;
  refundPayment(ref: string, amount: string, reason?: string): Promise<{ refundRef: string; status: string }>;
}

export class WebhookSignatureError extends Error {}

/** "1250.50" → 125050 (centavos), exactly, without floating point. */
export const toMinor = (amount: string) => {
  const [whole, frac = ''] = amount.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
};

// ── mock ──
const sign = (secret: string, raw: Buffer | string) => createHmac('sha256', secret).update(raw).digest('hex');

/**
 * Local and e2e default. Checkout redirects to the web app's /checkout/pay/{ref} page, whose Succeed / Fail / Cancel buttons
 * call `simulate`, which produces a signed event and feeds it to the same webhook handler a real provider would.
 */
export function createMockProvider(opts: { secret: string; webUrl: string; redis: Redis; prefix: string }): PaymentProvider & {
  simulate(ref: string, outcome: 'succeed' | 'fail' | 'cancel'): { raw: Buffer; headers: Record<string, string> };
} {
  const key = (ref: string) => `${opts.prefix}:mockpay:${ref}`;
  return {
    name: 'mock',
    isTest: true,
    async createCheckoutSession(order, urls) {
      const ref = `mock_${randomUUID()}`;
      await opts.redis.set(key(ref), JSON.stringify({ status: 'PENDING', total: order.total, number: order.number }), 'EX', 86400).catch(() => undefined);
      const back = (u: string) => encodeURIComponent(u.startsWith(opts.webUrl) ? u.slice(opts.webUrl.length) || '/' : '/');
      return { ref, redirectUrl: `${opts.webUrl}/checkout/pay/${ref}?next=${back(urls.success)}&cancel=${back(urls.cancel)}` };
    },
    simulate(ref, outcome) {
      const type = ({ succeed: 'payment.succeeded', fail: 'payment.failed', cancel: 'payment.cancelled' } as const)[outcome];
      const raw = Buffer.from(JSON.stringify({ id: `mockevt_${randomUUID()}`, type, ref }));
      return { raw, headers: { 'x-mock-signature': sign(opts.secret, raw) } };
    },
    async handleWebhook(raw, headers) {
      const got = String(headers['x-mock-signature'] ?? '');
      const want = sign(opts.secret, raw);
      if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) throw new WebhookSignatureError('bad signature');
      const e = JSON.parse(raw.toString('utf8')) as NormalizedPaymentEvent;
      const status = e.type === 'payment.succeeded' ? 'SUCCEEDED' : e.type === 'payment.failed' ? 'FAILED' : 'CANCELLED';
      await opts.redis.set(key(e.ref), JSON.stringify({ status }), 'EX', 86400).catch(() => undefined);
      return e;
    },
    async getPaymentStatus(ref) {
      const v = await opts.redis.get(key(ref)).catch(() => null);
      return v ? (JSON.parse(v).status as ProviderStatus) : 'PENDING';
    },
    async refundPayment(_ref, _amount) {
      return { refundRef: `mock_re_${randomUUID()}`, status: 'succeeded' };
    },
  };
}

// ── Stripe (test mode) ──
/** Refuses live keys unless PAYMENTS_LIVE_APPROVED=true, which this repository never sets. */
export function assertTestKey(key: string | undefined, liveApproved: boolean) {
  if (!key) throw new Error('PAYMENT_PROVIDER=stripe_test needs STRIPE_SECRET_KEY');
  if (/^(sk|rk)_live_/.test(key) && !liveApproved) throw new Error('Refusing a live Stripe key: live payments need explicit approval (PAYMENTS_LIVE_APPROVED=true).');
  if (!/^(sk|rk)_(test|live)_/.test(key)) throw new Error('STRIPE_SECRET_KEY does not look like a Stripe secret key');
}

export function createStripeProvider(opts: { secretKey?: string; webhookSecret?: string; liveApproved: boolean; client?: Stripe }): PaymentProvider {
  assertTestKey(opts.secretKey, opts.liveApproved);
  const stripe = opts.client ?? new Stripe(opts.secretKey!, { maxNetworkRetries: 2, timeout: 15000 });
  const isTest = !/^(sk|rk)_live_/.test(opts.secretKey!);
  return {
    name: 'stripe_test',
    isTest,
    async createCheckoutSession(order, urls) {
      const line = (name: string, amount: string, quantity: number) => ({ quantity, price_data: { currency: order.currency.toLowerCase(), unit_amount: toMinor(amount), product_data: { name } } });
      const s = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: order.email,
          client_reference_id: order.orderId,
          metadata: { orderId: order.orderId, number: order.number },
          line_items: [...order.lines.map((l) => line(l.name, l.unitPrice, l.quantity)), ...(toMinor(order.deliveryFee) > 0 ? [line('Delivery', order.deliveryFee, 1)] : [])],
          success_url: `${urls.success}${urls.success.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: urls.cancel,
          expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // Stripe's minimum is 30 minutes
        },
        { idempotencyKey: `checkout:${order.orderId}` },
      );
      if (!s.url) throw new Error('Stripe returned no checkout URL');
      return { ref: s.id, redirectUrl: s.url };
    },
    async handleWebhook(raw, headers) {
      if (!opts.webhookSecret) throw new WebhookSignatureError('STRIPE_WEBHOOK_SECRET is not set');
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(raw, String(headers['stripe-signature'] ?? ''), opts.webhookSecret);
      } catch {
        throw new WebhookSignatureError('bad signature');
      }
      const s = event.data.object as Stripe.Checkout.Session;
      switch (event.type) {
        case 'checkout.session.completed':
          return s.payment_status === 'paid' ? { id: event.id, type: 'payment.succeeded', ref: s.id } : null; // async methods settle later
        case 'checkout.session.async_payment_succeeded':
          return { id: event.id, type: 'payment.succeeded', ref: s.id };
        case 'checkout.session.async_payment_failed':
          return { id: event.id, type: 'payment.failed', ref: s.id };
        case 'checkout.session.expired':
          return { id: event.id, type: 'payment.cancelled', ref: s.id };
        default:
          return null;
      }
    },
    async getPaymentStatus(ref) {
      const s = await stripe.checkout.sessions.retrieve(ref);
      if (s.status === 'complete' && s.payment_status === 'paid') return 'SUCCEEDED';
      if (s.status === 'expired') return 'CANCELLED';
      return 'PENDING';
    },
    async refundPayment(ref, amount, reason) {
      const s = await stripe.checkout.sessions.retrieve(ref);
      const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id;
      if (!pi) throw new Error('This payment has no charge to refund');
      const r = await stripe.refunds.create({ payment_intent: pi, amount: toMinor(amount), metadata: reason ? { reason: reason.slice(0, 450) } : undefined });
      return { refundRef: r.id, status: r.status ?? 'pending' };
    },
  };
}
