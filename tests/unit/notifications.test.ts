import { BroadcastBody, Href, NotificationListQuery, PreferenceUpdate, PushSubscriptionBody } from '@greenscape/validation';
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../apps/api/src/lib/events.ts';
import { backoffMs, classifyPushError, decodeCursor, effectivePreference, encodeCursor, pushOptions } from '../../apps/api/src/modules/notifications/logic.ts';
import { createHub } from '../../apps/api/src/modules/notifications/hub.ts';

describe('retry backoff', () => {
  it('doubles from 30 s and caps at one hour', () => {
    const at = (n: number) => backoffMs(n, 0.5); // random 0.5 = no jitter
    expect([1, 2, 3, 4, 5].map(at)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(at(20)).toBe(3_600_000);
  });
  it('jitters within ±20%', () => {
    expect(backoffMs(3, 0)).toBe(96_000);
    expect(backoffMs(3, 1)).toBe(144_000);
  });
});

describe('push provider responses', () => {
  it.each([[404], [410]])('%i means the subscription is gone', (statusCode) => expect(classifyPushError({ statusCode })).toEqual({ kind: 'gone' }));
  it.each([[429], [500], [503], [408]])('%i is retried', (statusCode) => expect(classifyPushError({ statusCode }).kind).toBe('retry'));
  it('network errors (no status) are retried', () => expect(classifyPushError({ message: 'ECONNRESET' }).kind).toBe('retry'));
  it.each([[400], [401], [403], [413]])('%i is final: the same request can never succeed', (statusCode) => expect(classifyPushError({ statusCode }).kind).toBe('failed'));
});

describe('preferences', () => {
  it('default to everything on', () => expect(effectivePreference('orders')).toEqual({ inApp: true, push: true, sound: true }));
  it('honour saved choices', () => expect(effectivePreference('orders', { inApp: true, push: false, sound: false })).toEqual({ inApp: true, push: false, sound: false }));
  it('never push something hidden from the inbox', () => expect(effectivePreference('orders', { inApp: false, push: true, sound: true })).toMatchObject({ inApp: false, push: false }));
  it('cannot hide account and security notices', () => expect(effectivePreference('account', { inApp: false, push: true, sound: true }).inApp).toBe(true));
});

describe('cursor', () => {
  const id = '3f2b8c1e-9d4a-4e0b-8a55-1c2d3e4f5a6b';
  it('round-trips', () => {
    const d = new Date('2026-11-10T03:04:05.678Z');
    expect(decodeCursor(encodeCursor(d, id))).toEqual({ createdAt: d, id });
  });
  it.each(['', 'nope', 'x_y', '2026-11-10T03:04:05.678Z_', '2026-11-10T03:04:05.678Z_not-a-uuid', "2026-11-10T03:04:05.678Z_'; DROP TABLE"])('rejects %j', (c) => expect(decodeCursor(c)).toBeNull());
});

describe('push delivery hints', () => {
  it('wakes the device for urgent items and lets low-priority ones wait', () => {
    expect(pushOptions('URGENT').urgency).toBe('high');
    expect(pushOptions('NORMAL').urgency).toBe('normal');
    expect(pushOptions('LOW').urgency).toBe('low');
    expect(pushOptions('LOW').TTL).toBeLessThan(pushOptions('HIGH').TTL);
  });
});

describe('request contracts', () => {
  it.each(['/orders', '/orders/GS-2026-000001', '/quotations/abc?tab=notes'])('accepts the deep link %s', (h) => expect(Href.safeParse(h).success).toBe(true));
  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)', '/\\evil', 'orders'])('rejects the deep link %s', (h) => expect(Href.safeParse(h).success).toBe(false));
  it('requires https push endpoints (no plain http, no other schemes)', () => {
    const keys = { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) };
    const ok = { app: 'web', deviceId: 'device-12345', subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys } };
    expect(PushSubscriptionBody.safeParse(ok).success).toBe(true);
    expect(PushSubscriptionBody.safeParse({ ...ok, subscription: { endpoint: 'http://127.0.0.1/x', keys } }).success).toBe(false);
  });
  it('requires an app on every list query and caps page size', () => {
    expect(NotificationListQuery.safeParse({}).success).toBe(false);
    expect(NotificationListQuery.safeParse({ app: 'web', limit: '500' }).success).toBe(false);
    expect(NotificationListQuery.parse({ app: 'admin', unread: 'true' }).unread).toBe(true);
  });
  it('validates broadcasts and preference updates', () => {
    expect(BroadcastBody.safeParse({ title: '', message: 'x', app: 'web' }).success).toBe(false);
    expect(BroadcastBody.safeParse({ title: 'Closed Friday', message: 'We are closed.', app: 'web', href: 'https://x.test' }).success).toBe(false);
    expect(PreferenceUpdate.safeParse({ preferences: [{ category: 'nope', inApp: true, push: true, sound: true }] }).success).toBe(false);
  });
});

describe('event bus', () => {
  it('runs every subscriber and survives one that throws', async () => {
    const error = vi.fn();
    const bus = createEventBus({ error });
    const seen: string[] = [];
    bus.on('order.paid', () => { throw new Error('boom'); });
    bus.on('order.paid', ({ orderId }) => void seen.push(orderId));
    await expect(bus.emit('order.paid', { orderId: 'o1', lowVariantIds: [] })).resolves.toBeUndefined();
    expect(seen).toEqual(['o1']);
    expect(error).toHaveBeenCalledOnce();
  });
  it('does nothing for an event nobody listens to', async () => {
    await expect(createEventBus({ error: vi.fn() }).emit('inquiry.received', { inquiryId: 'i' })).resolves.toBeUndefined();
  });
});

describe('live hub (single instance, no Redis)', () => {
  const hub = createHub({ redis: { status: 'end' } as never, prefix: 't', log: { warn: vi.fn() } as never });
  const e = (userId: string) => ({ userId, app: 'web' as const, event: 'created', data: {} });
  it('delivers only to the recipient and stops after unsubscribe', () => {
    const a = vi.fn(), b = vi.fn();
    const offA = hub.subscribe('alice', a);
    hub.subscribe('bob', b);
    hub.publish(e('alice'));
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    offA();
    hub.publish(e('alice'));
    expect(a).toHaveBeenCalledOnce();
    expect(hub.count('alice')).toBe(0);
  });
  it('serves several tabs of one user', () => {
    const t1 = vi.fn(), t2 = vi.fn();
    hub.subscribe('carol', t1);
    hub.subscribe('carol', t2);
    hub.publish(e('carol'));
    expect([t1.mock.calls.length, t2.mock.calls.length]).toEqual([1, 1]);
    expect(hub.count('carol')).toBe(2);
  });
});
