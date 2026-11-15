// In-process domain events. Business code reports what happened ("an order was paid") after its database
// transaction has committed; subscribers (notifications today) decide what to do about it. Events carry ids, not
// data: handlers load what they need, so they always see the committed state.
//
// shortcut: events are in-process and emitted after commit, so a crash between the commit and the emit loses that
// notification (the business data is safe). Upgrade to a transactional outbox if a lost notice ever matters.
import type { Logger } from './logger.ts';

export interface AppEvents {
  'user.registered': { userId: string };
  'user.roles_changed': { userId: string; roles: string[] };
  'quotation.submitted': { quotationId: string };
  'quotation.status_changed': { quotationId: string };
  'quotation.assigned': { quotationId: string; assigneeId: string };
  'order.paid': { orderId: string; lowVariantIds: string[] };
  'order.cancelled': { orderId: string; reason: string };
  'order.refunded': { orderId: string };
  'order.fulfillment_changed': { orderId: string };
  'message.from_customer': { userId: string; preview: string };
  'message.from_staff': { customerUserId: string; preview: string };
  'inquiry.received': { inquiryId: string };
  'leave.requested': { leaveId: string };
  'leave.decided': { leaveId: string };
  'correction.requested': { correctionId: string };
  'correction.decided': { correctionId: string };
  /** A schedule's shifts were edited (everyone on it), or one employee was moved onto a schedule. */
  'schedule.changed': { scheduleId: string; employeeId?: string; effectiveFrom?: string };
  /** A day was closed without a clock-out: the employee should ask for a correction. */
  'attendance.incomplete': { recordId: string };
  'testimonial.submitted': { testimonialId: string; rating: number };
  /** A punch was recorded or an admin changed attendance. kind: clocked_in | clocked_out | edited | approved. */
  'attendance.changed': { employeeId?: string; kind: string };
  'employee.updated': { employeeId: string };
  /** Status changed or sessions revoked (userId), or one session signed out (sessionId): open sockets must re-check. */
  'user.access_changed': { userId?: string; sessionId?: string };
  'order.created': { orderId: string };
  'catalog.changed': { what: 'products' | 'inventory'; id?: string };
  'cms.published': { type: string; slug: string };
}
export type EventName = keyof AppEvents;
type Handler<K extends EventName> = (payload: AppEvents[K]) => unknown;

export function createEventBus(log: Pick<Logger, 'error'>) {
  const handlers: { [K in EventName]?: Handler<K>[] } = {};
  return {
    on<K extends EventName>(name: K, handler: Handler<K>) {
      (handlers[name] ??= []).push(handler as never);
    },
    /** Never throws: a failing subscriber is logged, it must not fail the business action that already succeeded. */
    async emit<K extends EventName>(name: K, payload: AppEvents[K]) {
      const list = (handlers[name] ?? []) as Handler<K>[];
      await Promise.all(list.map(async (h) => { try { await h(payload); } catch (err) { log.error({ err, event: name }, 'event handler failed'); } }));
    },
  };
}
export type EventBus = ReturnType<typeof createEventBus>;
