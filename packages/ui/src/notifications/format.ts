// Pure helpers for showing notifications (no React), so they can be unit-tested.
import type { NotificationView } from '@greenscape/validation';

export type Group = 'Today' | 'Yesterday' | 'Earlier';

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Buckets by the viewer's local calendar day (not "last 24 hours"), keeping the incoming newest-first order. Empty groups are dropped. */
export function groupByDay(items: NotificationView[], now = new Date()): { group: Group; items: NotificationView[] }[] {
  const today = dayStart(now);
  const yesterday = today - 86_400_000;
  const out: Record<Group, NotificationView[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of items) {
    const t = dayStart(new Date(n.createdAt));
    out[t >= today ? 'Today' : t >= yesterday ? 'Yesterday' : 'Earlier'].push(n);
  }
  return (['Today', 'Yesterday', 'Earlier'] as const).filter((g) => out[g].length).map((g) => ({ group: g, items: out[g] }));
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
/** "just now", "5 minutes ago", "yesterday", then a short date. */
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(s / 86_400), 'day');
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface FeedFilter { unread?: boolean; category?: string }

/** Does a notification belong in a list with this filter? Used to place live arrivals in filtered views. */
export const matches = (n: Pick<NotificationView, 'category' | 'read'>, f: FeedFilter) => (!f.unread || !n.read) && (!f.category || n.category === f.category);

/** The server events that change a list, applied the same way everywhere (bell, notification centre, other tabs). */
export type StreamEvent =
  | { event: 'created'; data: { notification: NotificationView; sound?: boolean } }
  | { event: 'read'; data: { ids: string[] } }
  | { event: 'read_all'; data: Record<string, never> }
  | { event: 'deleted'; data: { ids: string[] } }
  | { event: 'cleared'; data: { readOnly: boolean } };

export function applyEvent(items: NotificationView[], e: StreamEvent, filter: FeedFilter = {}): NotificationView[] {
  switch (e.event) {
    case 'created':
      return items.some((i) => i.id === e.data.notification.id) || !matches(e.data.notification, filter) ? items : [e.data.notification, ...items];
    case 'read': {
      const ids = new Set(e.data.ids);
      return items.flatMap((i) => (ids.has(i.id) ? (filter.unread ? [] : [{ ...i, read: true }]) : [i]));
    }
    case 'read_all':
      return filter.unread ? [] : items.map((i) => (i.read ? i : { ...i, read: true }));
    case 'deleted':
      return items.filter((i) => !e.data.ids.includes(i.id));
    case 'cleared':
      return e.data.readOnly ? items.filter((i) => !i.read) : [];
  }
}
