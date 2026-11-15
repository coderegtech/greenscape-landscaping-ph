// Turns committed domain events into live "this changed" signals and access revocations. Signals carry ids only;
// the page that hears one re-fetches through the API, which applies the reader's permissions again.
import type { Deps } from '../lib/deps.ts';

export function registerRealtimeHandlers({ db, events, realtime: rt }: Pick<Deps, 'db' | 'events' | 'realtime'>) {
  const userOfEmployee = async (employeeId?: string) => (employeeId ? (await db.employee.findUnique({ where: { id: employeeId }, select: { userId: true } }))?.userId : null);

  // ── access: closed sockets reconnect only if the account still may (the handshake re-checks everything) ──
  events.on('user.roles_changed', ({ userId }) => { rt.disconnectUser(userId); rt.live('users', 'roles_changed', { ref: userId }); });
  events.on('user.access_changed', ({ userId, sessionId }) => {
    if (sessionId) rt.disconnectSession(sessionId);
    if (userId) { rt.disconnectUser(userId); rt.live('users', 'access_changed', { ref: userId }); }
  });

  // ── workforce ──
  events.on('attendance.changed', async ({ employeeId, kind }) => rt.live('attendance', kind, { ref: employeeId, userIds: [await userOfEmployee(employeeId)] }));
  events.on('attendance.incomplete', async ({ recordId }) => {
    const r = await db.attendanceRecord.findUnique({ where: { id: recordId }, select: { employee: { select: { userId: true } } } });
    rt.live('attendance', 'incomplete', { ref: recordId, userIds: [r?.employee.userId] });
  });
  const correction = async (id: string, kind: string) => {
    const c = await db.attendanceCorrection.findUnique({ where: { id }, select: { record: { select: { employee: { select: { userId: true } } } } } });
    rt.live('corrections', kind, { ref: id, userIds: [c?.record.employee.userId] });
  };
  events.on('correction.requested', ({ correctionId }) => correction(correctionId, 'requested'));
  events.on('correction.decided', ({ correctionId }) => correction(correctionId, 'decided'));
  const leave = async (id: string, kind: string) => {
    const l = await db.leaveRequest.findUnique({ where: { id }, select: { employee: { select: { userId: true } } } });
    rt.live('leave', kind, { ref: id, userIds: [l?.employee.userId] });
  };
  events.on('leave.requested', ({ leaveId }) => leave(leaveId, 'requested'));
  events.on('leave.decided', ({ leaveId }) => leave(leaveId, 'decided'));
  events.on('schedule.changed', async ({ scheduleId, employeeId }) => {
    const people = employeeId
      ? [await userOfEmployee(employeeId)]
      : (await db.employee.findMany({ where: { scheduleAssignments: { some: { scheduleId, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] } } }, select: { userId: true } })).map((e) => e.userId);
    rt.live('schedule', employeeId ? 'assigned' : 'updated', { ref: scheduleId, userIds: people });
  });
  events.on('employee.updated', async ({ employeeId }) => rt.live('employees', 'updated', { ref: employeeId, userIds: [await userOfEmployee(employeeId)] }));

  // ── shop ──
  events.on('order.created', ({ orderId }) => rt.live('orders', 'created', { ref: orderId }));
  events.on('order.paid', ({ orderId, lowVariantIds }) => {
    rt.live('orders', 'paid', { ref: orderId });
    if (lowVariantIds.length) rt.live('inventory', 'low_stock');
  });
  events.on('order.cancelled', ({ orderId }) => rt.live('orders', 'cancelled', { ref: orderId }));
  events.on('order.refunded', ({ orderId }) => rt.live('orders', 'refunded', { ref: orderId }));
  events.on('order.fulfillment_changed', ({ orderId }) => rt.live('orders', 'fulfillment', { ref: orderId }));
  events.on('catalog.changed', ({ what, id }) => rt.live(what, 'updated', { ref: id }));

  // ── quotes, messages, content ──
  events.on('quotation.submitted', ({ quotationId }) => rt.live('quotations', 'created', { ref: quotationId }));
  events.on('quotation.status_changed', ({ quotationId }) => rt.live('quotations', 'updated', { ref: quotationId }));
  events.on('quotation.assigned', ({ quotationId }) => rt.live('quotations', 'assigned', { ref: quotationId }));
  events.on('message.from_customer', () => rt.live('messages', 'received'));
  events.on('message.from_staff', () => rt.live('messages', 'replied'));
  events.on('inquiry.received', ({ inquiryId }) => rt.live('messages', 'inquiry', { ref: inquiryId }));
  events.on('testimonial.submitted', ({ testimonialId }) => rt.live('cms', 'review', { ref: testimonialId }));
  events.on('cms.published', ({ type, slug }) => rt.live('cms', 'published', { ref: `${type}/${slug}` }));
}
