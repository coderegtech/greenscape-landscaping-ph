import 'server-only';
import { api } from '@greenscape/auth/api';
import { z } from '@greenscape/validation';
import { cache } from 'react';
import type { NavBadges } from './nav';

// One permission-aware call: the API leaves out every section this person may not see.
export const Overview = z.object({
  today: z.string(),
  sales: z.object({ days: z.array(z.object({ date: z.string(), revenue: z.string(), orders: z.number() })), today: z.object({ revenue: z.string(), orders: z.number() }), includesTest: z.boolean() }).optional(),
  orders: z.object({ toFulfil: z.number(), awaitingPayment: z.number(), recent: z.array(z.object({ id: z.string(), number: z.string(), customer: z.string(), total: z.string(), statusLabel: z.string(), placedAt: z.string() })) }).optional(),
  inventory: z.object({ lowStock: z.number() }).optional(),
  quotations: z.object({ new: z.number(), recent: z.array(z.object({ id: z.string(), number: z.string(), name: z.string(), statusLabel: z.string(), submittedAt: z.string(), projectLocation: z.string().nullable() })) }).optional(),
  messages: z.object({ unreadConversations: z.number(), newInquiries: z.number() }).optional(),
  attendance: z.object({ employees: z.number(), in: z.number(), late: z.number(), onLeave: z.number(), pendingCorrections: z.number() }).optional(),
  leave: z.object({ pending: z.number() }).optional(),
  testimonials: z.object({ pending: z.number() }).optional(),
  content: z.object({ recent: z.array(z.object({ id: z.string(), action: z.string(), type: z.string(), record: z.string(), by: z.string().nullable(), at: z.string() })) }).optional(),
});
export type Overview = z.infer<typeof Overview>;

/** Cached per request: the layout (menu badges) and the dashboard share one call. null = the API did not answer. */
export const getOverview = cache(() => api('/v1/admin/overview', Overview).catch(() => null));

/** What is waiting behind each menu link. A missing section stays undefined (no badge), never 0. */
export const badgesFrom = (o: Overview | null): NavBadges =>
  o ? {
    orders: o.orders?.toFulfil,
    stock: o.inventory?.lowStock,
    quotations: o.quotations?.new,
    messages: o.messages && o.messages.unreadConversations + o.messages.newInquiries,
    corrections: o.attendance?.pendingCorrections,
    leave: o.leave?.pending,
    testimonials: o.testimonials?.pending,
  } : {};
