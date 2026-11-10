// Admin console: overview, customers, messages (customer chat + contact form), settings, sales report.
// Every section checks its own permission; the overview only returns the parts the caller may see.
import { collections } from '@greenscape/content';
import { Prisma } from '@greenscape/database';
import {
  ConversationStatus, CustomerQuery, DateRange, FULFILLMENT_LABELS, INQUIRY_STATUSES, InquiryStatus, MessageBody, NOTIFY_KINDS, NotificationSettings,
  ORDER_STATUS_LABELS, QUOTATION_STATUS_LABELS, z,
} from '@greenscape/validation';
import ExcelJS from 'exceljs';
import { Router, type Response } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';
import { emailHtml, emailText } from '../../lib/mailer.ts';
import { NOTIFY_KEY, SETTINGS_TAG, notifyTo } from '../../lib/notify.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';
import { addDays, manilaDate, manilaInstant } from '../attendance/time.ts';
import { money } from '../shop/orders.ts';

for (const [m, p, s] of [
  ['get', '/v1/admin/overview', 'Dashboard: only the sections the caller may see (admin.access)'],
  ['get', '/v1/admin/customers', 'Customers with paid-order totals: q, sort, page (customers.read)'],
  ['get', '/v1/admin/customers/{id}', 'Customer with orders, quotations and conversation (customers.read)'],
  ['get', '/v1/admin/conversations', 'Customer conversations (messages.read)'],
  ['get', '/v1/admin/conversations/{id}', 'A conversation; marks the customer’s messages read (messages.read)'],
  ['post', '/v1/admin/conversations/{id}/messages', 'Reply; the customer is emailed (messages.reply)'],
  ['get', '/v1/admin/inquiries', 'Contact-form messages: status (messages.read)'],
  ['post', '/v1/admin/inquiries/{id}/reply', 'Reply by email (messages.reply)'],
  ['get', '/v1/admin/settings/notifications', 'Who receives staff emails (settings.read)'],
  ['put', '/v1/admin/settings/notifications', 'Change recipients (settings.manage)'],
  ['get', '/v1/admin/reports/sales', 'Sales for ?from&to, format=json|csv|xlsx (reports.sales)'],
  ['get', '/v1/me/messages', 'Your conversation with Greenscape (signed in)'],
  ['post', '/v1/me/messages', 'Send Greenscape a message (signed in)'],
] as const) registry.registerPath({ method: m, path: p, tags: ['admin'], auth: true, summary: s, responses: { 200: { description: 'ok' } } });

const Id = z.string().uuid();
const SOLD = ['PAID', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dayStart = (ymd: string) => manilaInstant(ymd, '00:00');

export function adminRoutes(deps: Deps) {
  const { db, mongo, mailer, env, cache } = deps;
  const r = Router();
  const me = (res: Response) => currentAuth(res);
  const allowed = (res: Response, p: string) => me(res).permissions.has(p);

  // ── overview ──
  r.get('/overview', requirePermission('admin.access'), async (_req, res) => {
    const today = manilaDate(new Date());
    const out: Record<string, unknown> = { today };
    const jobs: Promise<void>[] = [];
    if (allowed(res, 'reports.sales')) jobs.push((async () => {
      const from = addDays(today, -13);
      const orders = await db.order.findMany({ where: { status: { in: [...SOLD] }, placedAt: { gte: dayStart(from) } }, select: { total: true, placedAt: true, payments: { select: { isTest: true, refunds: { select: { amount: true } } } } } });
      const days = Array.from({ length: 14 }, (_, i) => addDays(from, i)).map((d) => ({ date: d, revenue: 0, orders: 0 }));
      let test = false;
      for (const o of orders) {
        const d = days.find((x) => x.date === manilaDate(o.placedAt));
        if (!d) continue;
        const refunded = o.payments.flatMap((p) => p.refunds).reduce((n, x) => n + Number(x.amount), 0);
        d.revenue += Number(o.total) - refunded;
        d.orders++;
        test ||= o.payments.some((p) => p.isTest);
      }
      const fixed = days.map((d) => ({ ...d, revenue: d.revenue.toFixed(2) }));
      out.sales = { days: fixed, today: fixed.at(-1), includesTest: test };
    })());
    if (allowed(res, 'orders.read')) jobs.push((async () => {
      const [toFulfil, awaitingPayment, recent] = await Promise.all([
        db.order.count({ where: { status: 'PAID', fulfillment: { in: ['UNFULFILLED', 'PREPARING', 'OUT_FOR_DELIVERY'] } } }),
        db.order.count({ where: { status: 'PENDING_PAYMENT' } }),
        db.order.findMany({ orderBy: { placedAt: 'desc' }, take: 5, include: { customer: { select: { name: true } } } }),
      ]);
      out.orders = { toFulfil, awaitingPayment, recent: recent.map((o) => ({ id: o.id, number: o.number, customer: o.customer.name, total: money(o.total), statusLabel: o.status === 'PAID' ? FULFILLMENT_LABELS[o.fulfillment] : ORDER_STATUS_LABELS[o.status], placedAt: o.placedAt.toISOString() })) };
    })());
    if (allowed(res, 'inventory.read')) jobs.push((async () => {
      const [{ n } = { n: 0n }] = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "InventoryLevel" i JOIN "ProductVariant" v ON v."id" = i."variantId" JOIN "Product" p ON p."id" = v."productId"
        WHERE v."trackInventory" AND v."isActive" AND p."status" = 'ACTIVE' AND i."onHand" - i."reserved" <= i."lowStockAt"`;
      out.inventory = { lowStock: Number(n) };
    })());
    if (allowed(res, 'quotations.read')) jobs.push((async () => {
      const [fresh, recent] = await Promise.all([
        db.quotation.count({ where: { status: 'NEW' } }),
        db.quotation.findMany({ orderBy: { submittedAt: 'desc' }, take: 5, select: { id: true, number: true, name: true, status: true, submittedAt: true, projectLocation: true } }),
      ]);
      out.quotations = { new: fresh, recent: recent.map((q) => ({ ...q, statusLabel: QUOTATION_STATUS_LABELS[q.status], submittedAt: q.submittedAt.toISOString() })) };
    })());
    if (allowed(res, 'messages.read')) jobs.push((async () => {
      const [conversations, inquiries] = await Promise.all([db.conversation.count({ where: { status: 'open', unreadForStaff: { gt: 0 } } }), db.contactInquiry.count({ where: { status: 'new' } })]);
      out.messages = { unreadConversations: conversations, newInquiries: inquiries };
    })());
    if (allowed(res, 'attendance.read')) jobs.push((async () => {
      const [groups, employees, corrections] = await Promise.all([
        db.attendanceRecord.groupBy({ by: ['status'], where: { workDate: new Date(`${today}T00:00:00Z`) }, _count: true }),
        db.employee.count({ where: { employmentStatus: { in: ['ACTIVE', 'PROBATION'] } } }),
        db.attendanceCorrection.count({ where: { status: 'PENDING' } }),
      ]);
      const c = Object.fromEntries(groups.map((g) => [g.status, g._count]));
      out.attendance = { employees, in: (c.OPEN ?? 0) + (c.PRESENT ?? 0) + (c.LATE ?? 0), late: c.LATE ?? 0, onLeave: c.ON_LEAVE ?? 0, pendingCorrections: corrections };
    })());
    if (allowed(res, 'leave.read')) jobs.push(db.leaveRequest.count({ where: { status: 'PENDING' } }).then((n) => { out.leave = { pending: n }; }));
    if (allowed(res, 'testimonials.moderate')) jobs.push(mongo.db.collection(collections.testimonials).countDocuments({ status: 'pending' }).then((n) => { out.testimonials = { pending: n }; }));
    await Promise.all(jobs);
    res.set('cache-control', 'no-store').json(out);
  });

  // ── customers ──
  r.get('/customers', requirePermission('customers.read'), async (req, res) => {
    const q = CustomerQuery.parse(req.query);
    const like = `%${(q.q ?? '').replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const where = q.q ? Prisma.sql`WHERE c."name" ILIKE ${like} OR c."email" ILIKE ${like} OR c."phone" ILIKE ${like}` : Prisma.empty;
    const order = { recent: Prisma.sql`MAX(o."placedAt") DESC NULLS LAST, c."createdAt" DESC`, spent: Prisma.sql`spent DESC`, orders: Prisma.sql`orders DESC`, name: Prisma.sql`c."name" ASC` }[q.sort];
    const rows = await db.$queryRaw<{ id: string; name: string; email: string; phone: string | null; hasAccount: boolean; orders: bigint; spent: Prisma.Decimal; lastOrderAt: Date | null; quotes: bigint }[]>`
      SELECT c."id", c."name", c."email", c."phone", (c."userId" IS NOT NULL) AS "hasAccount",
        COUNT(o."id") FILTER (WHERE o."status"::text IN ('PAID','COMPLETED','PARTIALLY_REFUNDED','REFUNDED')) AS orders,
        COALESCE(SUM(o."total") FILTER (WHERE o."status"::text IN ('PAID','COMPLETED','PARTIALLY_REFUNDED')), 0) AS spent,
        MAX(o."placedAt") AS "lastOrderAt",
        (SELECT COUNT(*) FROM "Quotation" q WHERE q."customerId" = c."id") AS quotes
      FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c."id"
      ${where}
      GROUP BY c."id"
      ORDER BY ${order}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
    const [{ n } = { n: 0n }] = await db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM "Customer" c ${where}`;
    res.json({ total: Number(n), page: q.page, pageSize: q.pageSize, items: rows.map((x) => ({ ...x, orders: Number(x.orders), quotes: Number(x.quotes), spent: money(x.spent), lastOrderAt: x.lastOrderAt?.toISOString() ?? null })) });
  });
  r.get('/customers/:id', requirePermission('customers.read'), async (req, res) => {
    const c = await db.customer.findUnique({ where: { id: Id.parse(req.params.id) }, include: { orders: { orderBy: { placedAt: 'desc' }, take: 50 }, quotations: { orderBy: { submittedAt: 'desc' }, take: 50 } } });
    if (!c) throw AppError.notFound('Customer not found');
    const conversation = c.userId ? await db.conversation.findFirst({ where: { customerUserId: c.userId }, select: { id: true, status: true, lastMessageAt: true } }) : null;
    res.json({
      id: c.id, name: c.name, email: c.email, phone: c.phone, hasAccount: !!c.userId, marketingConsent: c.marketingConsent, createdAt: c.createdAt.toISOString(),
      orders: c.orders.map((o) => ({ id: o.id, number: o.number, status: o.status, statusLabel: ORDER_STATUS_LABELS[o.status], fulfillmentLabel: FULFILLMENT_LABELS[o.fulfillment], total: money(o.total), placedAt: o.placedAt.toISOString() })),
      quotations: allowed(res, 'quotations.read') ? c.quotations.map((q) => ({ id: q.id, number: q.number, statusLabel: QUOTATION_STATUS_LABELS[q.status], submittedAt: q.submittedAt.toISOString() })) : [],
      conversation: allowed(res, 'messages.read') && conversation ? { ...conversation, lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null } : null,
    });
  });

  // ── customer conversations (staff side) ──
  const thread = async (id: string) => {
    const c = await db.conversation.findUnique({ where: { id }, include: { customer: { select: { email: true, displayName: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 500 } } });
    if (!c) throw AppError.notFound('Conversation not found');
    return {
      id: c.id, status: c.status, customer: { name: c.customer.displayName ?? c.customer.email.split('@')[0], email: c.customer.email },
      messages: c.messages.map((m) => ({ id: m.id, fromCustomer: m.senderUserId === c.customerUserId, body: m.body, at: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null })),
    };
  };
  r.get('/conversations', requirePermission('messages.read'), async (req, res) => {
    const status = z.enum(['open', 'closed']).default('open').parse(req.query.status);
    const rows = await db.conversation.findMany({ where: { status }, orderBy: { lastMessageAt: 'desc' }, take: 200, include: { customer: { select: { email: true, displayName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    res.json(rows.map((c) => ({ id: c.id, customer: c.customer.displayName ?? c.customer.email.split('@')[0], email: c.customer.email, unread: c.unreadForStaff, lastMessageAt: c.lastMessageAt?.toISOString() ?? null, preview: c.messages[0]?.body.slice(0, 140) ?? '', lastFromCustomer: c.messages[0]?.senderUserId === c.customerUserId })));
  });
  r.get('/conversations/:id', requirePermission('messages.read'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const c = await db.conversation.findUnique({ where: { id } });
    if (!c) throw AppError.notFound();
    await db.$transaction([
      db.message.updateMany({ where: { conversationId: id, senderUserId: c.customerUserId, readAt: null }, data: { readAt: new Date() } }),
      db.conversation.update({ where: { id }, data: { unreadForStaff: 0 } }),
    ]);
    res.set('cache-control', 'no-store').json(await thread(id));
  });
  r.post('/conversations/:id/messages', requirePermission('messages.reply'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { body } = MessageBody.parse(req.body);
    const c = await db.conversation.findUnique({ where: { id }, include: { customer: { select: { email: true } } } });
    if (!c) throw AppError.notFound();
    await db.$transaction([
      db.message.create({ data: { conversationId: id, senderUserId: me(res).userId, body } }),
      db.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), status: 'open' } }),
    ]);
    await mailer.send({
      to: c.customer.email,
      subject: 'Greenscape replied to your message',
      text: emailText('You have a reply', [body.slice(0, 1000)], [], { label: 'Open your messages', href: `${env.WEB_URL}/messages` }),
      html: emailHtml('You have a reply', [body.slice(0, 1000)], [], { label: 'Open your messages', href: `${env.WEB_URL}/messages` }),
    });
    res.status(201).json(await thread(id));
  });
  r.patch('/conversations/:id', requirePermission('messages.reply'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { status } = ConversationStatus.parse(req.body);
    await db.conversation.update({ where: { id }, data: { status } });
    res.json(await thread(id));
  });

  // ── contact-form messages ──
  const inquiryView = (i: { id: string; name: string; email: string; phone: string | null; subject: string | null; body: string; status: string; createdAt: Date; replies?: { body: string; sentAt: Date }[] }) => ({
    id: i.id, name: i.name, email: i.email, phone: i.phone, subject: i.subject, body: i.body, status: i.status, statusLabel: INQUIRY_STATUSES[i.status as keyof typeof INQUIRY_STATUSES] ?? i.status, createdAt: i.createdAt.toISOString(),
    replies: (i.replies ?? []).map((x) => ({ body: x.body, sentAt: x.sentAt.toISOString() })),
  });
  r.get('/inquiries', requirePermission('messages.read'), async (req, res) => {
    const status = z.enum(['new', 'replied', 'closed']).default('new').parse(req.query.status);
    const rows = await db.contactInquiry.findMany({ where: { status }, orderBy: { createdAt: status === 'new' ? 'asc' : 'desc' }, take: 200, include: { replies: { orderBy: { sentAt: 'asc' } } } });
    res.json(rows.map(inquiryView));
  });
  r.post('/inquiries/:id/reply', requirePermission('messages.reply'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { body } = MessageBody.parse(req.body);
    const i = await db.contactInquiry.findUnique({ where: { id } });
    if (!i) throw AppError.notFound();
    const replyTo = (await notifyTo(deps, 'messages'))[0];
    const sent = await mailer.send({
      to: i.email,
      ...(replyTo ? { replyTo } : {}),
      subject: i.subject ? `Re: ${i.subject}` : 'Re: your message to Greenscape',
      text: emailText(`Hi ${i.name}`, [body, `You wrote: “${i.body.slice(0, 500)}”`], []),
      html: emailHtml(`Hi ${i.name}`, [body, `You wrote: “${i.body.slice(0, 500)}”`], []),
    });
    const out = await db.$transaction(async (tx) => {
      await tx.inquiryReply.create({ data: { inquiryId: id, senderUserId: me(res).userId, body } });
      return tx.contactInquiry.update({ where: { id }, data: { status: 'replied' }, include: { replies: { orderBy: { sentAt: 'asc' } } } });
    });
    await audit(db, req, res, { action: 'inquiry.reply', entityType: 'contactInquiry', entityId: id, after: { emailed: sent } });
    res.status(201).json({ ...inquiryView(out), emailed: sent });
  });
  r.patch('/inquiries/:id', requirePermission('messages.reply'), async (req, res) => {
    const id = Id.parse(req.params.id);
    const { status } = InquiryStatus.parse(req.body);
    res.json(inquiryView(await db.contactInquiry.update({ where: { id }, data: { status }, include: { replies: true } })));
  });

  // ── settings ──
  r.get('/settings/notifications', requirePermission('settings.read'), async (_req, res) => {
    const saved = (await db.appSetting.findUnique({ where: { key: NOTIFY_KEY } }))?.value as Record<string, string[]> | undefined;
    const effective = Object.fromEntries(await Promise.all(Object.keys(NOTIFY_KINDS).map(async (k) => [k, await notifyTo(deps, k as keyof typeof NOTIFY_KINDS)])));
    res.json({ saved: saved ?? null, effective, kinds: NOTIFY_KINDS });
  });
  r.put('/settings/notifications', requirePermission('settings.manage'), async (req, res) => {
    const value = NotificationSettings.parse(req.body);
    const before = await db.appSetting.findUnique({ where: { key: NOTIFY_KEY } });
    await db.appSetting.upsert({ where: { key: NOTIFY_KEY }, create: { key: NOTIFY_KEY, value, updatedById: me(res).userId }, update: { value, updatedById: me(res).userId } });
    await cache.invalidateTags([SETTINGS_TAG]);
    await audit(db, req, res, { action: 'settings.notifications', entityType: 'setting', entityId: NOTIFY_KEY, before: before?.value ?? null, after: value });
    res.json({ saved: value });
  });

  // ── sales report ──
  r.get('/reports/sales', requirePermission('reports.sales'), async (req, res) => {
    const { from, to } = DateRange.parse(req.query);
    const format = z.enum(['json', 'csv', 'xlsx']).default('json').parse(req.query.format);
    const orders = await db.order.findMany({
      where: { status: { in: [...SOLD] }, placedAt: { gte: dayStart(from), lt: dayStart(addDays(to, 1)) } },
      orderBy: { placedAt: 'asc' },
      include: { customer: { select: { name: true } }, items: true, payments: { include: { refunds: true } } },
    });
    const refundOf = (o: (typeof orders)[number]) => o.payments.flatMap((p) => p.refunds).filter((x) => x.status !== 'failed').reduce((n, x) => n + Number(x.amount), 0);
    const gross = orders.reduce((n, o) => n + Number(o.total), 0);
    const refunds = orders.reduce((n, o) => n + refundOf(o), 0);
    const delivery = orders.reduce((n, o) => n + Number(o.deliveryFee), 0);
    const days = new Map<string, { date: string; orders: number; net: number }>();
    for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, { date: d, orders: 0, net: 0 });
    const products = new Map<string, { sku: string; name: string; quantity: number; revenue: number }>();
    const zones = new Map<string, { area: string; orders: number; net: number }>();
    for (const o of orders) {
      const net = Number(o.total) - refundOf(o);
      const d = days.get(manilaDate(o.placedAt))!;
      d.orders++; d.net += net;
      const city = (o.shippingAddress as { city?: string }).city ?? 'Unknown';
      const z1 = zones.get(city) ?? { area: city, orders: 0, net: 0 };
      z1.orders++; z1.net += net; zones.set(city, z1);
      for (const i of o.items) {
        const p = products.get(i.sku) ?? { sku: i.sku, name: i.name, quantity: 0, revenue: 0 };
        p.quantity += i.quantity; p.revenue += Number(i.lineTotal); products.set(i.sku, p);
      }
    }
    const fx = (n: number) => n.toFixed(2);
    const report = {
      from, to,
      includesTest: orders.some((o) => o.payments.some((p) => p.isTest)),
      summary: { orders: orders.length, gross: fx(gross), refunds: fx(refunds), net: fx(gross - refunds), deliveryFees: fx(delivery), averageOrder: fx(orders.length ? gross / orders.length : 0) },
      days: [...days.values()].map((d) => ({ ...d, net: fx(d.net) })),
      products: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 50).map((p) => ({ ...p, revenue: fx(p.revenue) })),
      areas: [...zones.values()].sort((a, b) => b.net - a.net).map((z2) => ({ ...z2, net: fx(z2.net) })),
    };
    const file = `sales-${from}-to-${to}`;
    const orderRows = orders.map((o) => ({ number: o.number, placed: manilaDate(o.placedAt), customer: o.customer.name, area: (o.shippingAddress as { city?: string }).city ?? '', items: o.items.reduce((n, i) => n + i.quantity, 0), subtotal: money(o.subtotal), delivery: money(o.deliveryFee), total: money(o.total), refunded: fx(refundOf(o)), status: ORDER_STATUS_LABELS[o.status], test: o.payments.some((p) => p.isTest) ? 'yes' : '' }));
    if (format === 'json') return res.json(report);
    if (format === 'csv') {
      const head = ['Order', 'Placed', 'Customer', 'Area', 'Items', 'Subtotal', 'Delivery', 'Total', 'Refunded', 'Status', 'Test payment'];
      const lines = [head.join(','), ...orderRows.map((x) => Object.values(x).map(csvCell).join(','))];
      return res.set('content-type', 'text/csv; charset=utf-8').set('content-disposition', `attachment; filename="${file}.csv"`).send(lines.join('\r\n'));
    }
    const wb = new ExcelJS.Workbook();
    const sheet = (name: string, cols: [string, string][], rows: Record<string, unknown>[]) => {
      const ws = wb.addWorksheet(name);
      ws.columns = cols.map(([key, header]) => ({ key, header, width: Math.max(12, header.length + 4) }));
      ws.addRows(rows);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    };
    sheet('Summary', [['k', 'Measure'], ['v', 'Value']], [{ k: 'From', v: from }, { k: 'To', v: to }, { k: 'Orders', v: report.summary.orders }, { k: 'Gross (PHP)', v: Number(report.summary.gross) }, { k: 'Refunds (PHP)', v: Number(report.summary.refunds) }, { k: 'Net (PHP)', v: Number(report.summary.net) }, { k: 'Delivery fees (PHP)', v: Number(report.summary.deliveryFees) }, { k: 'Average order (PHP)', v: Number(report.summary.averageOrder) }, ...(report.includesTest ? [{ k: 'Note', v: 'Includes test-mode payments' }] : [])]);
    sheet('By day', [['date', 'Date'], ['orders', 'Orders'], ['net', 'Net (PHP)']], report.days.map((d) => ({ ...d, net: Number(d.net) })));
    sheet('Products', [['sku', 'SKU'], ['name', 'Product'], ['quantity', 'Quantity'], ['revenue', 'Revenue (PHP)']], report.products.map((p) => ({ ...p, revenue: Number(p.revenue) })));
    sheet('Orders', [['number', 'Order'], ['placed', 'Placed'], ['customer', 'Customer'], ['area', 'Area'], ['items', 'Items'], ['subtotal', 'Subtotal'], ['delivery', 'Delivery'], ['total', 'Total'], ['refunded', 'Refunded'], ['status', 'Status'], ['test', 'Test payment']], orderRows);
    res.set('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('content-disposition', `attachment; filename="${file}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  return r;
}

/** The customer's side of "Message us" (any signed-in account). */
export function customerMessageRoutes(deps: Deps) {
  const { db, mailer, env } = deps;
  const r = Router();
  const view = async (userId: string) => {
    const c = await db.conversation.findFirst({ where: { customerUserId: userId }, include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } } });
    if (!c) return { messages: [] };
    await db.message.updateMany({ where: { conversationId: c.id, senderUserId: { not: userId }, readAt: null }, data: { readAt: new Date() } });
    return { messages: c.messages.map((m) => ({ id: m.id, fromMe: m.senderUserId === userId, body: m.body, at: m.createdAt.toISOString() })) };
  };
  r.get('/me/messages', requireAuth, async (_req, res) => res.set('cache-control', 'no-store').json(await view(currentAuth(res).userId)));
  r.post('/me/messages', requireAuth, formLimit(deps, 'message', 30), async (req, res) => {
    const auth = currentAuth(res);
    const { body } = MessageBody.parse(req.body);
    const { firstUnread } = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conversation:${auth.userId}`}))`;
      const existing = await tx.conversation.findFirst({ where: { customerUserId: auth.userId } });
      const c = existing ?? (await tx.conversation.create({ data: { customerUserId: auth.userId } }));
      await tx.message.create({ data: { conversationId: c.id, senderUserId: auth.userId, body } });
      await tx.conversation.update({ where: { id: c.id }, data: { lastMessageAt: new Date(), status: 'open', unreadForStaff: { increment: 1 } } });
      return { firstUnread: !existing || existing.unreadForStaff === 0 };
    });
    // One email per batch of unread messages, not one per message.
    if (firstUnread) {
      await mailer.send({
        to: await notifyTo(deps, 'messages'),
        replyTo: auth.email,
        subject: `New message from ${auth.email}`,
        text: emailText('New customer message', [body.slice(0, 1000)], [], { label: 'Open messages', href: `${env.ADMIN_URL}/messages` }),
        html: emailHtml('New customer message', [body.slice(0, 1000)], [], { label: 'Open messages', href: `${env.ADMIN_URL}/messages` }),
      });
    }
    res.status(201).json(await view(auth.userId));
  });
  return r;
}
