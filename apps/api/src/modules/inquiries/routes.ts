import { collections } from '@greenscape/content';
import { ContactRequest, TestimonialRequest } from '@greenscape/validation';
import { Router } from 'express';
import type { Deps } from '../../lib/deps.ts';
import { notifyTo } from '../../lib/notify.ts';
import { emailHtml, emailText } from '../../lib/mailer.ts';
import { registry } from '../../lib/openapi.ts';
import { currentAuth, requireAuth } from '../../middleware/auth.ts';
import { formLimit } from '../../middleware/form-limit.ts';

registry.registerPath({ method: 'post', path: '/v1/contact', tags: ['inquiries'], summary: 'Send a message to Greenscape (public; rate-limited). Stored and emailed to the team.', body: ContactRequest, responses: { 201: { description: 'received' } } });
registry.registerPath({ method: 'post', path: '/v1/testimonials', tags: ['inquiries'], auth: true, summary: 'Share feedback (signed in). Held as pending until a content manager approves it.', body: TestimonialRequest, responses: { 201: { description: 'pending moderation' } } });

/** "Juan Dela Cruz" → "Juan C." (how the current site attributes feedback; never the full name). */
const shortName = (n: string) => {
  const [first, ...rest] = n.trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)![0]!.toUpperCase()}.` : (first ?? 'Client');
};

export function inquiryRoutes(deps: Deps) {
  const { db, mongo, mailer, env, redis } = deps;
  const r = Router();

  r.post('/contact', formLimit(redis, env.CACHE_PREFIX, 'contact', env.FORM_RATE_LIMIT_PER_HOUR), async (req, res) => {
    const m = ContactRequest.parse(req.body);
    if (m.website) return res.status(201).json({ received: true }); // honeypot
    const row = await db.contactInquiry.create({ data: { name: m.name, email: m.email, phone: m.phone, subject: m.subject, body: m.message } });
    const rows: [string, string][] = [['From', `${m.name} <${m.email}>`], ['Phone', m.phone ?? 'Not given'], ['Subject', m.subject ?? 'General']];
    await mailer.send({ to: await notifyTo(deps, 'messages'), replyTo: m.email, subject: `Website message from ${m.name}`, text: emailText('New website message', [m.message], rows), html: emailHtml('New website message', [m.message], rows) });
    await deps.events.emit('inquiry.received', { inquiryId: row.id });
    res.status(201).json({ received: true, id: row.id });
  });

  r.post('/testimonials', requireAuth, formLimit(redis, env.CACHE_PREFIX, 'testimonial', 5), async (req, res) => {
    const t = TestimonialRequest.parse(req.body);
    const auth = currentAuth(res);
    const user = await db.user.findUniqueOrThrow({ where: { id: auth.userId }, select: { displayName: true, email: true } });
    await mongo.db.collection(collections.testimonials).insertOne({
      name: shortName(user.displayName ?? user.email.split('@')[0]!),
      role: 'Verified client',
      projectType: t.projectType,
      rating: t.rating,
      text: t.text,
      userId: auth.userId,
      status: 'pending',
      createdAt: new Date(),
    });
    res.status(201).json({ status: 'pending' });
  });

  return r;
}
