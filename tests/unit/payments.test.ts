import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WebhookSignatureError, assertTestKey, createStripeProvider, toMinor } from '../../apps/api/src/modules/shop/payments.ts';

const WHSEC = 'whsec_unit_test_secret';
const provider = createStripeProvider({ secretKey: 'sk_test_unit', webhookSecret: WHSEC, liveApproved: false });
/** Stripe's documented signature header: t=<unix>,v1=HMAC-SHA256(secret, "<t>.<payload>"). */
const header = (payload: string, secret: string) => {
  const t = Math.floor(Date.now() / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
};
const deliver = (event: object, secret = WHSEC) => {
  const payload = JSON.stringify(event);
  return provider.handleWebhook(Buffer.from(payload), { 'stripe-signature': header(payload, secret) });
};
const session = (over: object = {}) => ({ id: 'cs_test_123', object: 'checkout.session', payment_status: 'paid', status: 'complete', ...over });
const event = (type: string, obj: object) => ({ id: `evt_${type}`, object: 'event', type, data: { object: obj } });

describe('payments: Stripe adapter', () => {
  it('refuses live keys without explicit approval', () => {
    expect(() => assertTestKey('sk_live_abc', false)).toThrow(/live/i);
    expect(() => assertTestKey('rk_live_abc', false)).toThrow(/live/i);
    expect(() => assertTestKey(undefined, false)).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => assertTestKey('pk_test_abc', false)).toThrow(/does not look like/);
    expect(() => assertTestKey('sk_test_abc', false)).not.toThrow();
    expect(() => createStripeProvider({ secretKey: 'sk_live_abc', liveApproved: false })).toThrow(/live/i);
  });

  it('verifies signatures', async () => {
    await expect(deliver(event('checkout.session.completed', session()), 'whsec_wrong')).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider.handleWebhook(Buffer.from('{}'), {})).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('maps Checkout events to normalized payment events', async () => {
    expect(await deliver(event('checkout.session.completed', session()))).toEqual({ id: 'evt_checkout.session.completed', type: 'payment.succeeded', ref: 'cs_test_123' });
    expect(await deliver(event('checkout.session.completed', session({ payment_status: 'unpaid' })))).toBeNull(); // async method, settles later
    expect((await deliver(event('checkout.session.async_payment_succeeded', session())))?.type).toBe('payment.succeeded');
    expect((await deliver(event('checkout.session.async_payment_failed', session())))?.type).toBe('payment.failed');
    expect((await deliver(event('checkout.session.expired', session({ status: 'expired' }))))?.type).toBe('payment.cancelled');
    expect(await deliver(event('customer.created', { id: 'cus_1' }))).toBeNull();
  });

  it('converts pesos to centavos exactly', () => {
    expect(toMinor('1250')).toBe(125000);
    expect(toMinor('1250.5')).toBe(125050);
    expect(toMinor('0.07')).toBe(7);
    expect(toMinor('19.99')).toBe(1999); // 19.99 * 100 in floating point is 1998.9999…
  });
});
