import { collections } from '@greenscape/content';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../apps/api/src/app.ts';
import { closeDeps, type Deps } from '../../apps/api/src/lib/deps.ts';
import { testDeps } from './helpers.ts';
import { deleteAuthUsers, signedInUser } from './supabase.ts';

// 1×1 PNG and a text file pretending to be a PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const FAKE = Buffer.from('this is not an image, it is a text file');
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const tag = `it${Date.now()}`;
const email = (l: string) => `${l}-${tag}@test.greenscape.local`;

let deps: Deps;
let app: ReturnType<typeof createApp>;
const authIds: string[] = [];
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const quote = (over: Record<string, unknown> = {}) => ({
  services: ['landscaping', 'garden-maintenance'],
  propertyType: 'residential',
  projectLocation: 'San Jose, Puerto Princesa',
  areaSqm: 120,
  budgetRange: '50k-150k',
  details: 'Front garden needs new planting and a simple irrigation line along the fence.',
  name: 'Juan Dela Cruz',
  email: email('quote'),
  phone: '0917 844 3330',
  bestTimeToTalk: 'morning',
  consent: true,
  website: '',
  attachments: [],
  ...over,
});

async function upload(bytes: Buffer, contentType = 'image/png') {
  const slot = await request(app).post('/v1/quotations/attachments').set(bearer(who)).send({ filename: 'garden.png', contentType, size: bytes.length }).expect(201);
  const put = await fetch(slot.body.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType, 'x-upsert': 'false' }, body: new Uint8Array(bytes) });
  expect(put.ok).toBe(true);
  return slot.body.id as string;
}

async function mailsTo(address: string) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`).then((x) => x.json());
  return (r.messages ?? []) as { Subject: string }[];
}

let who = ''; // quotes, uploads and contact messages need an account
beforeAll(async () => {
  deps = await testDeps({ FORM_RATE_LIMIT_PER_HOUR: '1000', QUOTE_NOTIFY_TO: email('team') });
  app = createApp(deps);
  const u = await signedInUser(`quoter-${tag}`);
  authIds.push(u.authUserId);
  who = u.token;
});
afterAll(async () => {
  const qs = await deps.db.quotation.findMany({ where: { email: { endsWith: `${tag}@test.greenscape.local` } }, include: { attachments: true } });
  const media = qs.flatMap((q) => q.attachments.map((a) => a.mediaId));
  await deps.db.quotation.deleteMany({ where: { id: { in: qs.map((q) => q.id) } } });
  const assets = await deps.db.mediaAsset.findMany({ where: { OR: [{ id: { in: media } }, { refCount: 0, path: { startsWith: 'quotations/pending/' } }] } });
  await deps.storage.remove('private-docs', assets.map((a) => a.path)).catch(() => {});
  await deps.db.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
  await deps.db.contactInquiry.deleteMany({ where: { email: { endsWith: `${tag}@test.greenscape.local` } } });
  const users = await deps.db.user.findMany({ where: { authUserId: { in: authIds } }, select: { id: true } });
  await deps.mongo.db.collection(collections.testimonials).deleteMany({ userId: { $in: users.map((u) => u.id) } });
  await deps.db.auditLog.deleteMany({ where: { actorId: { in: users.map((u) => u.id) } } });
  await deps.db.customer.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await deps.db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await deleteAuthUsers(authIds);
  await closeDeps(deps);
});

describe('quote requests', () => {
  it('needs an account to request a quote or upload', async () => {
    await request(app).post('/v1/quotations').send(quote()).expect(401);
    await request(app).post('/v1/quotations/attachments').send({ filename: 'garden.png', contentType: 'image/png', size: 10 }).expect(401);
  });

  it('stores a request with a verified attachment, numbers it and emails both sides', async () => {
    const id = await upload(PNG);
    const res = await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ attachments: [id] })).expect(201);
    expect(res.body.number).toMatch(/^Q-\d{4}-\d{6}$/);
    const row = await deps.db.quotation.findUniqueOrThrow({ where: { number: res.body.number }, include: { attachments: { include: { media: true } } } });
    expect(row).toMatchObject({ phone: '+639178443330', propertyType: 'residential', areaSqm: 120, status: 'NEW' });
    expect(row.attachments[0]!.media).toMatchObject({ refCount: 1, mimeType: 'image/png', sizeBytes: PNG.length });

    await expect.poll(async () => (await mailsTo(email('quote'))).map((m) => m.Subject), { timeout: 10_000 }).toContain(`We received your quote request (${res.body.number})`);
    await expect.poll(async () => (await mailsTo(email('team'))).map((m) => m.Subject), { timeout: 10_000 }).toContain(`New quote request ${res.body.number} from Juan Dela Cruz`);
  });

  it('rejects a file that is not what it claims to be', async () => {
    const id = await upload(FAKE, 'image/png');
    const res = await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ attachments: [id] })).expect(400);
    expect(res.body.error.message).toMatch(/not the file type it claims/);
  });

  it('rejects attachment reuse and unknown ids', async () => {
    const id = await upload(PNG);
    await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ attachments: [id] })).expect(201);
    await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ attachments: [id] })).expect(400);
    await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ attachments: ['6f0f3c1e-0d5b-4a39-9f2e-6d9b5b2b8a11'] })).expect(400);
  });

  it('refuses disallowed attachment types and sizes before issuing a slot', async () => {
    await request(app).post('/v1/quotations/attachments').set(bearer(who)).send({ filename: 'x.exe', contentType: 'application/x-msdownload', size: 10 }).expect(400);
    await request(app).post('/v1/quotations/attachments').set(bearer(who)).send({ filename: 'big.pdf', contentType: 'application/pdf', size: 11 * 1024 * 1024 }).expect(400);
  });

  it('validates the request: services, consent, phone, past dates', async () => {
    const res = await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ services: [], consent: false, phone: '12345', preferredDate: '2020-01-01' })).expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['services', 'consent', 'phone', 'preferredDate']));
  });

  it('honeypot submissions look accepted but are not stored', async () => {
    const before = await deps.db.quotation.count();
    const res = await request(app).post('/v1/quotations').set(bearer(who)).send(quote({ website: 'http://spam.example' })).expect(201);
    expect(res.body.number).toMatch(/^Q-/);
    expect(await deps.db.quotation.count()).toBe(before);
  });

  it('signed-in requests link to the customer and appear in /mine; staff can triage with an audit trail', async () => {
    const cust = await signedInUser(`cust-${tag}`);
    authIds.push(cust.authUserId);
    const sent = await request(app).post('/v1/quotations').set(bearer(cust.token)).send(quote({ email: cust.email })).expect(201);
    const mine = await request(app).get('/v1/quotations/mine').set(bearer(cust.token)).expect(200);
    expect(mine.body.map((q: { number: string }) => q.number)).toContain(sent.body.number);

    await request(app).get('/v1/quotations').set(bearer(cust.token)).expect(403);

    const staff = await signedInUser(`staff-${tag}`);
    authIds.push(staff.authUserId);
    await request(app).get('/v1/auth/me').set(bearer(staff.token));
    const staffUser = await deps.db.user.findUniqueOrThrow({ where: { authUserId: staff.authUserId } });
    const role = await deps.db.role.findUniqueOrThrow({ where: { key: 'ecommerce_manager' } });
    await deps.db.userRole.create({ data: { userId: staffUser.id, roleId: role.id } });
    await deps.cache.invalidateTags([`authz:user:${staffUser.id}`]);

    const list = await request(app).get('/v1/quotations').query({ q: sent.body.number }).set(bearer(staff.token)).expect(200);
    const id = list.body.items[0].id;
    const detail = await request(app).get(`/v1/quotations/${id}`).set(bearer(staff.token)).expect(200);
    expect(detail.body.customer.userId).toBe((await deps.db.user.findUniqueOrThrow({ where: { authUserId: cust.authUserId } })).id);

    await request(app).patch(`/v1/quotations/${id}`).set(bearer(staff.token)).send({ status: 'CONTACTED' }).expect(200);
    await request(app).post(`/v1/quotations/${id}/notes`).set(bearer(staff.token)).send({ body: 'Called, site visit Tuesday.' }).expect(201);
    const log = await deps.db.auditLog.findFirstOrThrow({ where: { entityId: id, action: 'quotation.update' } });
    expect(log.after).toMatchObject({ status: 'CONTACTED' });
    const mine2 = await request(app).get('/v1/quotations/mine').set(bearer(cust.token)).expect(200);
    expect(mine2.body.find((q: { number: string }) => q.number === sent.body.number).status).toBe('CONTACTED');
  });
});

describe('contact and feedback', () => {
  it('stores and emails a contact message', async () => {
    await request(app).post('/v1/contact').send({ name: 'Maria Santos', email: email('contact'), message: 'x', consent: true }).expect(401);
    await request(app).post('/v1/contact').set(bearer(who)).send({ name: 'Maria Santos', email: email('contact'), message: 'Do you deliver plants to Roxas?', consent: true }).expect(201);
    expect(await deps.db.contactInquiry.count({ where: { email: email('contact') } })).toBe(1);
  });

  it('feedback needs sign-in, is held as pending and is not public until approved', async () => {
    await request(app).post('/v1/testimonials').send({ rating: 5, text: 'Great team and lovely garden work.', consent: true }).expect(401);
    const u = await signedInUser(`fb-${tag}`);
    authIds.push(u.authUserId);
    await request(app).post('/v1/testimonials').set(bearer(u.token)).send({ rating: 4, text: 'The crew was careful with our old mango tree.', consent: true }).expect(201);
    const pub = await request(app).get('/v1/cms/testimonials?limit=100').expect(200);
    expect(pub.body.map((t: { text: string }) => t.text)).not.toContain('The crew was careful with our old mango tree.');
    const userId = (await deps.db.user.findUniqueOrThrow({ where: { authUserId: u.authUserId } })).id;
    const doc = await deps.mongo.db.collection(collections.testimonials).findOne({ userId });
    expect(doc).toMatchObject({ status: 'pending', rating: 4 });
  });
});

describe('form rate limit', () => {
  it('limits submissions per account per hour', async () => {
    const tight = await testDeps({ FORM_RATE_LIMIT_PER_HOUR: '2', CACHE_PREFIX: `gs:test:rl:${Date.now()}` });
    const a = createApp(tight);
    const body = { name: 'Rate Test', email: email('rl'), message: 'Testing the limiter, please ignore.', consent: true };
    await request(a).post('/v1/contact').set(bearer(who)).send(body).expect(201);
    await request(a).post('/v1/contact').set(bearer(who)).send(body).expect(201);
    const res = await request(a).post('/v1/contact').set(bearer(who)).send(body).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await closeDeps(tight);
  });
});
