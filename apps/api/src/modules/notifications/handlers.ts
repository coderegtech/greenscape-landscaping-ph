// Turns domain events into notifications. This file is the catalogue of every notification the system sends:
// who gets it (a permission for staff, a user id for customers), where it shows (`web` or `admin`), what it says,
// and where it links. docs/notifications.md lists the same table. Wording follows the site: plain, no jargon.
import { FULFILLMENT_LABELS, QUOTATION_STATUS_LABELS, type NotificationApp } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { peso } from '../shop/orders.ts';
import type { NotifyInput, Notifications } from './service.ts';

type Body = Omit<NotifyInput, 'userId' | 'app'>;

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const STAFF_ROLES_EXCLUDED = new Set(['customer', 'employee']);

export function registerNotificationHandlers({ db, events }: Pick<Deps, 'db' | 'events'>, n: Notifications) {
  const toUser = (userId: string | null | undefined, app: NotificationApp, x: Body) => (userId ? n.notify({ userId, app, ...x }) : null);
  const toStaff = (permission: string, x: Body) => n.notifyPermission(permission, { app: 'admin', ...x });

  // ── account and security ──
  events.on('user.registered', ({ userId }) => toUser(userId, 'web', { type: 'user.welcome', category: 'account', title: 'Welcome to Greenscape', message: 'Your account is ready. Track your orders, quote requests and messages here.', href: '/account', priority: 'LOW', dedupeKey: `user.registered:${userId}` }));
  events.on('user.roles_changed', async ({ userId, roles }) => {
    const x = { type: 'user.roles_changed', category: 'account', title: 'Your access was changed', message: roles.length ? `Your account now has these roles: ${roles.join(', ')}. If you did not expect this, tell an administrator.` : 'All roles were removed from your account. If you did not expect this, tell an administrator.', priority: 'HIGH', dedupeKey: `user.roles_changed:${userId}:${roles.join(',')}:${new Date().toISOString().slice(0, 13)}` } as const;
    await toUser(userId, 'web', { ...x, href: '/account' });
    // Own key per app: UNIQUE(recipient, dedupeKey) would otherwise drop the console copy as a repeat of the website one.
    if (roles.some((r) => !STAFF_ROLES_EXCLUDED.has(r))) await toUser(userId, 'admin', { ...x, href: '/', dedupeKey: `${x.dedupeKey}:admin` });
  });

  // ── quotations ──
  events.on('quotation.submitted', async ({ quotationId }) => {
    const q = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { customer: { select: { userId: true } } } });
    await toStaff('quotations.read', { type: 'quotation.submitted', category: 'quotes', title: `New quote request ${q.number}`, message: clip(`${q.name}${q.projectLocation ? ` · ${q.projectLocation}` : ''}: ${q.details}`), href: `/quotations/${q.id}`, priority: 'HIGH', dedupeKey: `quotation.submitted:${q.id}` });
    await toUser(q.customer?.userId, 'web', { type: 'quotation.received', category: 'quotes', title: 'We received your quote request', message: `Reference ${q.number}. We will contact you within one working day.`, href: '/account', dedupeKey: `quotation.received:${q.id}` });
  });
  events.on('quotation.status_changed', async ({ quotationId }) => {
    const q = await db.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { customer: { select: { userId: true } } } });
    if (q.status === 'NEW' || q.status === 'ARCHIVED') return;
    await toUser(q.customer?.userId, 'web', { type: 'quotation.status_changed', category: 'quotes', title: `Quote request ${q.number} updated`, message: QUOTATION_STATUS_LABELS[q.status], href: '/account', dedupeKey: `quotation.status:${q.id}:${q.status}` });
  });
  events.on('quotation.assigned', async ({ quotationId, assigneeId }) => {
    const q = await db.quotation.findUniqueOrThrow({ where: { id: quotationId } });
    await toUser(assigneeId, 'admin', { type: 'quotation.assigned', category: 'quotes', title: `Quote request ${q.number} was assigned to you`, message: clip(`${q.name}: ${q.details}`), href: `/quotations/${q.id}`, dedupeKey: `quotation.assigned:${q.id}:${assigneeId}` });
  });

  // ── orders ──
  const orderFor = (orderId: string) => db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: { select: { userId: true } } } });
  events.on('order.paid', async ({ orderId, lowVariantIds }) => {
    const o = await orderFor(orderId);
    await toUser(o.customer.userId, 'web', { type: 'order.paid', category: 'orders', title: 'Payment received', message: `Order ${o.number} is confirmed and being prepared.`, href: `/orders/${o.number}`, dedupeKey: `order.paid:${o.id}` });
    await toStaff('orders.read', { type: 'order.paid.staff', category: 'orders', title: `New paid order ${o.number}`, message: `${peso(o.total)} paid.`, href: `/orders/${o.id}`, priority: 'HIGH', dedupeKey: `order.paid.staff:${o.id}` });
    if (lowVariantIds.length) {
      const vs = await db.productVariant.findMany({ where: { id: { in: lowVariantIds } }, select: { sku: true, product: { select: { name: true } } } });
      await toStaff('inventory.read', { type: 'stock.low', category: 'stock', title: 'Low stock', message: clip(vs.map((v) => `${v.product.name} (${v.sku})`).join(', ')), href: '/inventory?low=1', dedupeKey: `stock.low:${o.id}` });
    }
  });
  events.on('order.cancelled', async ({ orderId, reason }) => {
    const o = await orderFor(orderId);
    await toUser(o.customer.userId, 'web', { type: 'order.cancelled', category: 'orders', title: 'Order cancelled', message: `Order ${o.number} was cancelled${reason ? `: ${reason}` : ''}.`, href: `/orders/${o.number}`, priority: 'HIGH', dedupeKey: `order.cancelled:${o.id}` });
  });
  events.on('order.refunded', async ({ orderId }) => {
    const o = await orderFor(orderId);
    await toUser(o.customer.userId, 'web', { type: 'order.refunded', category: 'orders', title: 'Refund on its way', message: `We refunded order ${o.number}. It can take 5 to 10 banking days to show.`, href: `/orders/${o.number}`, priority: 'HIGH', dedupeKey: `order.refunded:${o.id}:${o.status}` });
  });
  events.on('order.fulfillment_changed', async ({ orderId }) => {
    const o = await orderFor(orderId);
    if (o.fulfillment === 'UNFULFILLED' || o.fulfillment === 'RETURNED') return;
    await toUser(o.customer.userId, 'web', { type: `order.${o.fulfillment.toLowerCase()}`, category: 'orders', title: FULFILLMENT_LABELS[o.fulfillment] === 'Delivered' ? 'Your order was delivered' : `Order ${FULFILLMENT_LABELS[o.fulfillment].toLowerCase()}`, message: `Order ${o.number}: ${FULFILLMENT_LABELS[o.fulfillment].toLowerCase()}.`, href: `/orders/${o.number}`, dedupeKey: `order.fulfillment:${o.id}:${o.fulfillment}` });
  });

  // ── messages and support ──
  events.on('message.from_customer', async ({ userId, preview }) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true, email: true } });
    await toStaff('messages.read', { type: 'message.from_customer', category: 'messages', title: `New message from ${u.displayName ?? u.email}`, message: clip(preview), href: '/messages', priority: 'HIGH' });
  });
  events.on('message.from_staff', ({ customerUserId, preview }) => toUser(customerUserId, 'web', { type: 'message.from_staff', category: 'messages', title: 'Greenscape replied to your message', message: clip(preview), href: '/messages', priority: 'HIGH' }));
  events.on('inquiry.received', async ({ inquiryId }) => {
    const i = await db.contactInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    await toStaff('messages.read', { type: 'inquiry.received', category: 'messages', title: `Website message from ${i.name}`, message: clip(i.body), href: '/messages/contact', dedupeKey: `inquiry.received:${i.id}` });
  });

  // ── attendance and leave ──
  const range = (a: Date, b: Date) => { const f = (d: Date) => d.toISOString().slice(0, 10); return f(a) === f(b) ? f(a) : `${f(a)} to ${f(b)}`; };
  events.on('leave.requested', async ({ leaveId }) => {
    const l = await db.leaveRequest.findUniqueOrThrow({ where: { id: leaveId }, include: { employee: true, leaveType: { select: { name: true } } } });
    await toStaff('leave.approve', { type: 'leave.requested', category: 'hr', title: `Leave request from ${l.employee.firstName} ${l.employee.lastName}`, message: `${l.leaveType.name}, ${range(l.startDate, l.endDate)} (${Number(l.days)} day${Number(l.days) === 1 ? '' : 's'}).`, href: '/leave', priority: 'HIGH', dedupeKey: `leave.requested:${l.id}` });
  });
  events.on('leave.decided', async ({ leaveId }) => {
    const l = await db.leaveRequest.findUniqueOrThrow({ where: { id: leaveId }, include: { employee: true, leaveType: { select: { name: true } } } });
    if (l.status === 'PENDING') return;
    const word = l.status === 'APPROVED' ? 'approved' : l.status === 'REJECTED' ? 'declined' : 'cancelled';
    await toUser(l.employee.userId, 'employee', { type: `leave.${word}`, category: 'hr', title: `Your leave was ${word}`, message: `${l.leaveType.name}, ${range(l.startDate, l.endDate)}.${l.decisionNote ? ` Note: ${l.decisionNote}` : ''}`, href: '/requests', priority: 'HIGH', dedupeKey: `leave.decided:${l.id}:${l.status}` });
  });
  events.on('correction.requested', async ({ correctionId }) => {
    const c = await db.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: { record: { include: { employee: true } } } });
    await toStaff('attendance.approve', { type: 'correction.requested', category: 'hr', title: `Time correction from ${c.record.employee.firstName} ${c.record.employee.lastName}`, message: clip(c.reason), href: '/attendance/corrections', priority: 'HIGH', dedupeKey: `correction.requested:${c.id}` });
  });
  events.on('correction.decided', async ({ correctionId }) => {
    const c = await db.attendanceCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: { record: { include: { employee: true } } } });
    if (c.status === 'PENDING') return;
    await toUser(c.record.employee.userId, 'employee', { type: `correction.${c.status.toLowerCase()}`, category: 'hr', title: `Your time correction was ${c.status === 'APPROVED' ? 'approved' : 'declined'}`, message: `For ${c.record.workDate.toISOString().slice(0, 10)}.`, href: '/attendance', dedupeKey: `correction.decided:${c.id}:${c.status}` });
  });

  events.on('schedule.changed', async ({ scheduleId, employeeId, effectiveFrom }) => {
    const s = await db.workSchedule.findUniqueOrThrow({ where: { id: scheduleId }, select: { name: true } });
    const day = new Date();
    // Only the people on this schedule hear about it, each in their own portal inbox.
    const people = await db.employee.findMany({
      where: employeeId ? { id: employeeId } : { employmentStatus: { in: ['ACTIVE', 'PROBATION'] }, scheduleAssignments: { some: { scheduleId, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] } } },
      select: { userId: true },
    });
    const body: Body = employeeId
      ? { type: 'schedule.assigned', category: 'hr', title: 'Your work schedule changed', message: `You are on "${s.name}"${effectiveFrom ? ` from ${effectiveFrom}` : ''}. Check your shifts.`, href: '/schedule', dedupeKey: `schedule.assigned:${scheduleId}:${effectiveFrom ?? ''}` }
      : { type: 'schedule.updated', category: 'hr', title: 'Your work schedule was updated', message: `The hours of "${s.name}" changed. Check your shifts.`, href: '/schedule', dedupeKey: `schedule.updated:${scheduleId}:${day.toISOString().slice(0, 13)}` };
    await Promise.all(people.map((e) => toUser(e.userId, 'employee', body)));
  });
  // Clock-ins only (clock-outs would double the noise for every admin). First name and initial: previews can show on a locked phone.
  events.on('attendance.changed', async ({ employeeId, kind }) => {
    if (kind !== 'clocked_in' || !employeeId) return;
    const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { firstName: true, lastName: true } });
    const at = new Date();
    const time = at.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
    await toStaff('attendance.read', { type: 'attendance.clock_in', category: 'clock', title: 'Employee clocked in', message: `${e.firstName} ${e.lastName.slice(0, 1)}. started their shift at ${time}.`, href: '/attendance', priority: 'LOW', dedupeKey: `clock_in:${employeeId}:${at.toISOString().slice(0, 16)}` });
  });
  events.on('attendance.incomplete', async ({ recordId }) => {
    const r = await db.attendanceRecord.findUniqueOrThrow({ where: { id: recordId }, include: { employee: { select: { userId: true } } } });
    await toUser(r.employee.userId, 'employee', { type: 'attendance.incomplete', category: 'hr', title: 'You did not clock out', message: `${r.workDate.toISOString().slice(0, 10)} has no clock-out. Ask for a correction so the day counts.`, href: '/attendance', priority: 'HIGH', dedupeKey: `attendance.incomplete:${r.id}` });
  });

  // ── reviews ──
  // No name or text in the notification: the review itself is only shown on the moderation page.
  events.on('testimonial.submitted', ({ testimonialId, rating }) => toStaff('testimonials.moderate', { type: 'testimonial.submitted', category: 'messages', title: 'New review to moderate', message: `A customer left a ${rating}-star review. It stays hidden until you approve it.`, href: '/cms/testimonials', dedupeKey: `testimonial.submitted:${testimonialId}` }));
}
