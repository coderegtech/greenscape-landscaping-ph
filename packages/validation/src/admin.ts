// Admin console contracts: customers, messages, settings, sales report.
import { z } from 'zod';
import { Email } from './primitives.ts';

export const NOTIFY_KINDS = { quotes: 'Quote requests', orders: 'Paid orders', messages: 'Messages and contact form', stock: 'Low stock' } as const;
export type NotifyKind = keyof typeof NOTIFY_KINDS;
export const NotificationSettings = z.object(
  Object.fromEntries(Object.keys(NOTIFY_KINDS).map((k) => [k, z.array(Email).max(10)])) as Record<NotifyKind, z.ZodArray<typeof Email>>,
);
export type NotificationSettings = z.infer<typeof NotificationSettings>;

export const MessageBody = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });
export const INQUIRY_STATUSES = { new: 'New', replied: 'Replied', closed: 'Closed' } as const;
export const InquiryStatus = z.object({ status: z.enum(Object.keys(INQUIRY_STATUSES) as ['new', 'replied', 'closed']) });
export const ConversationStatus = z.object({ status: z.enum(['open', 'closed']) });

export const CustomerQuery = z.object({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'spent', 'orders', 'name']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
