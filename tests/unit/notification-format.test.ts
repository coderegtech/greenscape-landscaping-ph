import type { NotificationView } from '@greenscape/validation';
import { describe, expect, it } from 'vitest';
import { applyEvent, groupByDay, matches, timeAgo } from '../../packages/ui/src/notifications/format.ts';

const n = (id: string, createdAt: string, over: Partial<NotificationView> = {}): NotificationView => ({ id, type: 't', category: 'orders', title: id, message: '', href: null, priority: 'NORMAL', read: false, createdAt, ...over });
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

describe('grouping by day', () => {
  const now = new Date(2026, 10, 10, 15, 0);
  it('buckets Today, Yesterday and Earlier by calendar day and keeps the order', () => {
    const items = [n('a', local(2026, 10, 10, 14)), n('b', local(2026, 10, 10, 0)), n('c', local(2026, 10, 9, 23)), n('d', local(2026, 10, 8, 12)), n('e', local(2025, 0, 1))];
    const g = groupByDay(items, now);
    expect(g.map((x) => [x.group, x.items.map((i) => i.id)])).toEqual([['Today', ['a', 'b']], ['Yesterday', ['c']], ['Earlier', ['d', 'e']]]);
  });
  it('drops empty groups', () => expect(groupByDay([n('x', local(2026, 10, 1))], now).map((g) => g.group)).toEqual(['Earlier']));
  it('is empty for no notifications', () => expect(groupByDay([], now)).toEqual([]));
});

describe('relative time', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  it.each([[10, 'just now'], [120, '2 minutes ago'], [3 * 3600, '3 hours ago'], [86_400 + 60, 'yesterday'], [3 * 86_400, '3 days ago']])('%is ago → %s', (secs, text) => expect(timeAgo(new Date(now - secs * 1000).toISOString(), now)).toBe(text));
  it('older than a week is a date', () => expect(timeAgo('2026-10-01T00:00:00Z', now)).toMatch(/2026/));
});

describe('applying live events to a list', () => {
  const items = [n('a', local(2026, 10, 10), { read: true }), n('b', local(2026, 10, 9))];
  it('adds a new arrival at the top, once', () => {
    const fresh = n('c', local(2026, 10, 10));
    const once = applyEvent(items, { event: 'created', data: { notification: fresh } });
    expect(once.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(applyEvent(once, { event: 'created', data: { notification: fresh } })).toBe(once); // reconnect replays do not duplicate
  });
  it('keeps arrivals out of lists whose filter they do not match', () => {
    const quote = n('q', local(2026, 10, 10), { category: 'quotes' });
    expect(applyEvent(items, { event: 'created', data: { notification: quote } }, { category: 'orders' })).toBe(items);
    expect(matches(quote, { category: 'quotes' })).toBe(true);
  });
  it('marks read, and removes from an unread-only list', () => {
    expect(applyEvent(items, { event: 'read', data: { ids: ['b'] } }).find((i) => i.id === 'b')!.read).toBe(true);
    expect(applyEvent(items, { event: 'read', data: { ids: ['b'] } }, { unread: true }).map((i) => i.id)).toEqual(['a']);
    expect(applyEvent(items, { event: 'read_all', data: {} }).every((i) => i.read)).toBe(true);
    expect(applyEvent(items, { event: 'read_all', data: {} }, { unread: true })).toEqual([]);
  });
  it('deletes one, clears read ones, clears all', () => {
    expect(applyEvent(items, { event: 'deleted', data: { ids: ['a'] } }).map((i) => i.id)).toEqual(['b']);
    expect(applyEvent(items, { event: 'cleared', data: { readOnly: true } }).map((i) => i.id)).toEqual(['b']);
    expect(applyEvent(items, { event: 'cleared', data: { readOnly: false } })).toEqual([]);
  });
});
