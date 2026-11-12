// Notification contracts: inbox, preferences, push subscriptions, broadcast. Shared by the API and both Next.js apps.
import { z } from 'zod';

/** Which portal shows a notification: the website, the admin console, or the employee portal. */
export const NOTIFICATION_APPS = ['web', 'admin', 'employee'] as const;
export type NotificationApp = (typeof NOTIFICATION_APPS)[number];

/** Preference buckets. `locked` categories always appear in the inbox (security and account notices). */
export const NOTIFICATION_CATEGORIES = {
  orders: { label: 'Orders and payments', locked: false },
  quotes: { label: 'Quote requests', locked: false },
  messages: { label: 'Messages and support', locked: false },
  stock: { label: 'Low stock', locked: false },
  hr: { label: 'Attendance and leave', locked: false },
  account: { label: 'Account and security', locked: true },
  system: { label: 'Announcements', locked: false },
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(NOTIFICATION_CATEGORIES) as [NotificationCategory, ...NotificationCategory[]];
const Category = z.enum(CATEGORY_KEYS);

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const Priority = z.enum(PRIORITIES);

/** Deep links are relative to the app that shows the notification; never absolute (no open redirects through a push). */
export const Href = z.string().max(300).regex(/^\/(?![/\\])[\w\-/?=&%.#]*$/, 'Use a path on this site, such as /orders');

export const NotificationView = z.object({
  id: z.string().uuid(),
  type: z.string(),
  category: Category,
  title: z.string(),
  message: z.string(),
  href: z.string().nullable(),
  priority: Priority,
  read: z.boolean(),
  createdAt: z.string(),
});
export type NotificationView = z.infer<typeof NotificationView>;

export const NotificationListQuery = z.object({
  app: z.enum(NOTIFICATION_APPS),
  cursor: z.string().max(100).optional(), // opaque: "<iso time>_<id>"
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  category: Category.optional(),
});
export const NotificationPage = z.object({ items: z.array(NotificationView), nextCursor: z.string().nullable(), unreadCount: z.number().int() });
export type NotificationPage = z.infer<typeof NotificationPage>;

export const AppQuery = z.object({ app: z.enum(NOTIFICATION_APPS) });
export const ClearQuery = AppQuery.extend({ readOnly: z.enum(['true', 'false']).optional().transform((v) => v === 'true') });

export const NotificationPreferenceItem = z.object({ category: Category, inApp: z.boolean(), push: z.boolean(), sound: z.boolean() });
export type NotificationPreferenceItem = z.infer<typeof NotificationPreferenceItem>;
export const PreferenceUpdate = z.object({ preferences: z.array(NotificationPreferenceItem).min(1).max(CATEGORY_KEYS.length) });

export const PushSubscriptionBody = z.object({
  app: z.enum(NOTIFICATION_APPS),
  deviceId: z.string().trim().min(8).max(100),
  subscription: z.object({
    endpoint: z.string().url().max(2000).startsWith('https://'),
    keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
  }),
});
export const PushUnsubscribeBody = z.object({ endpoint: z.string().url().max(2000) });

/** "Send an announcement": every audience entry is a role key; omit for everyone. */
export const BroadcastBody = z.object({
  title: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(400),
  href: Href.optional(),
  priority: Priority.default('NORMAL'),
  /** Which app's inbox gets it. */
  app: z.enum(NOTIFICATION_APPS),
  roles: z.array(z.string().max(40)).max(10).optional(),
});
export type BroadcastBody = z.infer<typeof BroadcastBody>;
