import { randomUUID } from 'node:crypto';
import { BUCKETS } from '@greenscape/storage';
import {
  ATTACHMENT_MAX_BYTES, AttachmentRequest, AttachmentSlot, BEST_TIMES, BUDGETS, MyQuotation, PROPERTY_TYPES, QUOTATION_STATUS_LABELS,
  QUOTE_SERVICES, QuotationListQuery, QuotationNoteBody, QuotationUpdate, QuoteReceipt, QuoteRequest, z,
} from '@greenscape/validation';
import { Router } from 'express';
import { audit } from '../../lib/audit.ts';
import type { Deps } from '../../lib/deps.ts';
import { notifyTo } from '../../lib/notify.ts';
import { AppError } from '../../lib/errors.ts';
import { emailHtml, emailText } from '../../lib/mailer.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth, requirePermission } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';

const BUCKET = BUCKETS.privateDocs.id;
const PENDING = 'quotations/pending/';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' };
const IdParam = z.object({ id: z.string().uuid() });

registry.registerPath({ method: 'post', path: '/v1/quotations/attachments', tags: ['quotations'], summary: 'Reserve an upload slot for one quote attachment (photo or PDF ≤ 10 MB). Upload to `uploadUrl`, then pass `id` in the quote.', body: AttachmentRequest, responses: { 201: { description: 'slot', schema: AttachmentSlot } } });
registry.registerPath({ method: 'post', path: '/v1/quotations', tags: ['quotations'], summary: 'Submit a quote request (public; rate-limited). Links to the customer when signed in. Emails the business and the requester.', body: QuoteRequest, responses: { 201: { description: 'receipt', schema: QuoteReceipt }, 400: { description: 'validation or attachment problem' } } });
registry.registerPath({ method: 'get', path: '/v1/quotations/mine', tags: ['quotations'], auth: true, summary: "The signed-in customer's quote requests and their status.", responses: { 200: { description: 'list', schema: z.array(MyQuotation) } } });
registry.registerPath({ method: 'get', path: '/v1/quotations', tags: ['quotations'], auth: true, summary: 'Quotation inbox (quotations.read).', query: QuotationListQuery, responses: { 200: { description: 'page' } } });
registry.registerPath({ method: 'get', path: '/v1/quotations/{id}', tags: ['quotations'], auth: true, summary: 'One quotation with notes and 5-minute attachment links (quotations.read).', responses: { 200: { description: 'quotation' } } });
registry.registerPath({ method: 'patch', path: '/v1/quotations/{id}', tags: ['quotations'], auth: true, summary: 'Change status / assignee (quotations.manage). Audited.', body: QuotationUpdate, responses: { 200: { description: 'updated' } } });
registry.registerPath({ method: 'post', path: '/v1/quotations/{id}/notes', tags: ['quotations'], auth: true, summary: 'Add an internal note (quotations.manage).', body: QuotationNoteBody, responses: { 201: { description: 'note' } } });

const yearOf = () => new Date(Date.now() + 8 * 3600_000).getUTCFullYear(); // Manila year

export function quotationRoutes(deps: Deps) {
  const { db, storage, mailer, env, log, redis } = deps;
  const r = Router();
  const limit = (name: string) => formLimit(redis, env.CACHE_PREFIX, name, env.FORM_RATE_LIMIT_PER_HOUR);

  // ── public: attachment slot ──
  r.post('/attachments', limit('quote-upload'), async (req, res) => {
    const { contentType, size } = AttachmentRequest.parse(req.body);
    const id = randomUUID();
    const path = `${PENDING}${id}.${EXT[contentType]}`;
    const slot = await storage.signedUpload(BUCKET, path);
    // refCount 0 until a quote claims it; unclaimed rows + objects are removed by the orphan sweep (Phase 7).
    await db.mediaAsset.create({ data: { id, bucket: BUCKET, path, mimeType: contentType, sizeBytes: size, refCount: 0 } });
    res.status(201).json(AttachmentSlot.parse({ id, uploadUrl: slot.url, token: slot.token, path }));
  });

  // ── public: submit ──
  r.post('/', limit('quote'), async (req, res) => {
    const q = QuoteRequest.parse(req.body);
    if (q.website) {
      // Honeypot filled: answer like a success so bots learn nothing, store nothing.
      log.warn({ ip: req.ip }, 'quote honeypot triggered');
      return res.status(201).json({ number: `Q-${yearOf()}-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`, status: 'NEW', submittedAt: new Date().toISOString() });
    }

    // Verify every attachment: reserved by us, unclaimed, uploaded, within size, and really the declared type.
    const assets = q.attachments.length ? await db.mediaAsset.findMany({ where: { id: { in: q.attachments } } }) : [];
    for (const id of q.attachments) {
      const a = assets.find((x) => x.id === id);
      if (!a || a.bucket !== BUCKET || !a.path.startsWith(PENDING) || a.refCount !== 0) throw AppError.badRequest('An attachment is invalid or already used. Please upload it again.', { id });
      const info = await storage.inspect(BUCKET, a.path);
      if (!info) throw AppError.badRequest('An attachment did not finish uploading. Please try again.', { id });
      if (info.size > ATTACHMENT_MAX_BYTES) throw AppError.badRequest('Attachments must be 10 MB or smaller.', { id });
      if (info.mime !== a.mimeType) throw AppError.badRequest('An attachment is not the file type it claims to be.', { id });
      a.sizeBytes = info.size;
    }

    const auth = res.locals.auth;
    const quotation = await db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('quotation_number_seq') AS n`;
      const n = row!.n;
      const number = `Q-${yearOf()}-${String(n).padStart(6, '0')}`;
      let customerId: string | undefined;
      if (auth) {
        const c = await tx.customer.upsert({ where: { userId: auth.userId }, create: { userId: auth.userId, email: auth.email, name: q.name, phone: q.phone }, update: {} });
        customerId = c.id;
      }
      const created = await tx.quotation.create({
        data: {
          number, customerId, name: q.name, email: q.email, phone: q.phone, services: q.services, projectLocation: q.projectLocation,
          propertyType: q.propertyType, areaSqm: q.areaSqm, budgetRange: q.budgetRange, bestTimeToTalk: q.bestTimeToTalk,
          preferredDate: q.preferredDate ? new Date(`${q.preferredDate}T00:00:00Z`) : undefined, details: q.details,
          attachments: { create: assets.map((a) => ({ mediaId: a.id })) },
        },
      });
      for (const a of assets) await tx.mediaAsset.update({ where: { id: a.id }, data: { refCount: 1, sizeBytes: a.sizeBytes } });
      return created;
    });

    const label = (m: Record<string, string>, k?: string | null) => (k ? (m[k] ?? k) : 'Not given');
    const rows: [string, string][] = [
      ['Reference', quotation.number],
      ['Services', q.services.map((s) => label(QUOTE_SERVICES, s)).join(', ')],
      ['Property', `${label(PROPERTY_TYPES, q.propertyType)}${q.areaSqm ? `, about ${q.areaSqm} sqm` : ''}`],
      ['Location', q.projectLocation],
      ['Budget', label(BUDGETS, q.budgetRange)],
      ['Preferred date', q.preferredDate ?? 'Flexible'],
      ['Best time to call', label(BEST_TIMES, q.bestTimeToTalk)],
      ['Attachments', String(assets.length)],
    ];
    const notify = {
      to: await notifyTo(deps, 'quotes'),
      replyTo: q.email,
      subject: `New quote request ${quotation.number} from ${q.name}`,
      text: emailText('New quote request', [`${q.name}, ${q.phone}, ${q.email}`, q.details], rows, { label: 'Open in admin', href: `${env.ADMIN_URL}/quotations/${quotation.id}` }),
      html: emailHtml('New quote request', [`${q.name}, ${q.phone}, ${q.email}`, q.details], rows, { label: 'Open in admin', href: `${env.ADMIN_URL}/quotations/${quotation.id}` }),
    };
    const confirm = {
      to: q.email,
      subject: `We received your quote request (${quotation.number})`,
      text: emailText('Thank you, we have your request', [`Hi ${q.name}, we will contact you within one working day to talk about your garden.`, 'If anything changes, reply to this email or call 0917 844 3330.'], rows),
      html: emailHtml('Thank you, we have your request', [`Hi ${q.name}, we will contact you within one working day to talk about your garden.`, 'If anything changes, reply to this email or call 0917 844 3330.'], rows, auth ? { label: 'Track your request', href: `${env.WEB_URL}/account` } : undefined),
    };
    await Promise.all([mailer.send(notify), mailer.send(confirm)]);

    res.status(201).json(QuoteReceipt.parse({ number: quotation.number, status: quotation.status, submittedAt: quotation.submittedAt.toISOString() }));
  });

  // ── customer: my requests (linked account, or submitted with my verified email before I had an account) ──
  r.get('/mine', requireAuth, async (_req, res) => {
    const auth = currentAuth(res);
    const rows = await db.quotation.findMany({
      where: { OR: [{ customer: { userId: auth.userId } }, { customerId: null, email: { equals: auth.email, mode: 'insensitive' } }] },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: { number: true, status: true, submittedAt: true, services: true, projectLocation: true },
    });
    res.json(rows.map((x) => MyQuotation.parse({ ...x, submittedAt: x.submittedAt.toISOString(), statusLabel: QUOTATION_STATUS_LABELS[x.status] })));
  });

  // ── staff inbox ──
  r.get('/', requirePermission('quotations.read'), async (req, res) => {
    const q = QuotationListQuery.parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' as const } }),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { email: { contains: q.q, mode: 'insensitive' as const } }, { number: { contains: q.q, mode: 'insensitive' as const } }, { projectLocation: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
    };
    const [items, total, counts] = await Promise.all([
      db.quotation.findMany({ where, orderBy: { submittedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, number: true, name: true, email: true, phone: true, services: true, projectLocation: true, status: true, submittedAt: true, _count: { select: { attachments: true } } } }),
      db.quotation.count({ where }),
      db.quotation.groupBy({ by: ['status'], _count: true }),
    ]);
    res.json({ items, page: q.page, pageSize: q.pageSize, total, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  });

  r.get('/:id', requirePermission('quotations.read'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const q = await db.quotation.findUnique({ where: { id }, include: { attachments: { include: { media: true } }, notes: { orderBy: { createdAt: 'desc' } }, customer: { select: { id: true, userId: true } } } });
    if (!q) throw AppError.notFound('Quotation not found');
    const attachments = await Promise.all(
      q.attachments.map(async (a) => ({ id: a.media.id, mimeType: a.media.mimeType, sizeBytes: a.media.sizeBytes, url: await storage.signedUrl(BUCKET, a.media.path, 300) })),
    );
    const authorIds = [...new Set(q.notes.map((n) => n.authorId))];
    const authors = await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, email: true, displayName: true } });
    res.json({ ...q, attachments, notes: q.notes.map((n) => ({ ...n, author: authors.find((u) => u.id === n.authorId) ?? null })) });
  });

  r.patch('/:id', requirePermission('quotations.manage'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const body = QuotationUpdate.parse(req.body);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.quotation.findUnique({ where: { id }, select: { status: true, assignedToId: true } });
      if (!before) throw AppError.notFound('Quotation not found');
      const after = await tx.quotation.update({ where: { id }, data: body, select: { id: true, status: true, assignedToId: true, updatedAt: true } });
      await audit(tx, req, res, { action: 'quotation.update', entityType: 'Quotation', entityId: id, before, after: { status: after.status, assignedToId: after.assignedToId } });
      return after;
    });
    res.json(updated);
  });

  r.post('/:id/notes', requirePermission('quotations.manage'), async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { body } = QuotationNoteBody.parse(req.body);
    const note = await db.quotationNote.create({ data: { quotationId: id, authorId: currentAuth(res).userId, body } });
    res.status(201).json(note);
  });

  return r;
}
